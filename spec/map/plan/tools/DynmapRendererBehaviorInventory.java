import com.sun.source.tree.AssertTree;
import com.sun.source.tree.BlockTree;
import com.sun.source.tree.CaseTree;
import com.sun.source.tree.ClassTree;
import com.sun.source.tree.CompilationUnitTree;
import com.sun.source.tree.ConditionalExpressionTree;
import com.sun.source.tree.DoWhileLoopTree;
import com.sun.source.tree.EnhancedForLoopTree;
import com.sun.source.tree.ForLoopTree;
import com.sun.source.tree.IfTree;
import com.sun.source.tree.MethodTree;
import com.sun.source.tree.SwitchExpressionTree;
import com.sun.source.tree.SwitchTree;
import com.sun.source.tree.Tree;
import com.sun.source.tree.TryTree;
import com.sun.source.tree.VariableTree;
import com.sun.source.tree.WhileLoopTree;
import com.sun.source.util.JavacTask;
import com.sun.source.util.SourcePositions;
import com.sun.source.util.TreeScanner;
import com.sun.source.util.Trees;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import javax.tools.Diagnostic;
import javax.tools.DiagnosticCollector;
import javax.tools.JavaCompiler;
import javax.tools.JavaFileObject;
import javax.tools.SimpleJavaFileObject;
import javax.tools.StandardJavaFileManager;
import javax.tools.ToolProvider;

/** Exact, syntax-only branch inventory for Dynmap's pinned built-in renderer Java sources. */
public final class DynmapRendererBehaviorInventory {
    private static final String RELATIVE_SOURCE_DIRECTORY =
        "DynmapCore/src/main/java/org/dynmap/hdmap/renderer";

    private DynmapRendererBehaviorInventory() {}

    private record SourceFile(Path path, String relativePath, String text, String sha256) {
        JavaFileObject asJavaFileObject() {
            return new SimpleJavaFileObject(path.toUri(), JavaFileObject.Kind.SOURCE) {
                @Override
                public CharSequence getCharContent(boolean ignoreEncodingErrors) {
                    return text;
                }
            };
        }
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 3) {
            System.err.println("Usage: java DynmapRendererBehaviorInventory.java <source-root> <output-json> <revision>");
            System.exit(2);
        }
        Path sourceRoot = Path.of(args[0]).toAbsolutePath().normalize().toRealPath();
        Path rendererRoot = sourceRoot.resolve(RELATIVE_SOURCE_DIRECTORY);
        Path output = Path.of(args[1]).toAbsolutePath().normalize();
        String revision = args[2];
        List<Path> paths;
        try (var walk = Files.walk(rendererRoot)) {
            paths = walk.filter(path -> Files.isRegularFile(path) && path.toString().endsWith(".java"))
                .sorted(Comparator.comparing(path -> sourceRoot.relativize(path).toString()))
                .toList();
        }
        List<SourceFile> files = new ArrayList<>();
        for (Path path : paths) {
            byte[] bytes = Files.readAllBytes(path);
            files.add(new SourceFile(path, sourceRoot.relativize(path).toString().replace('\\', '/'),
                new String(bytes, StandardCharsets.UTF_8), sha256(bytes)));
        }
        JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
        if (compiler == null) throw new IllegalStateException("A full JDK is required for javac AST parsing");
        DiagnosticCollector<JavaFileObject> diagnostics = new DiagnosticCollector<>();
        List<Map<String, Object>> classes = new ArrayList<>();
        int parsedFiles = 0;
        try (StandardJavaFileManager fileManager = compiler.getStandardFileManager(diagnostics, null, StandardCharsets.UTF_8)) {
            List<JavaFileObject> inputs = files.stream().map(SourceFile::asJavaFileObject).map(JavaFileObject.class::cast).toList();
            JavacTask task = (JavacTask) compiler.getTask(null, fileManager, diagnostics,
                List.of("-proc:none", "-Xlint:none", "-encoding", "UTF-8"), null, inputs);
            Trees trees = Trees.instance(task);
            SourcePositions positions = trees.getSourcePositions();
            for (CompilationUnitTree unit : task.parse()) {
                parsedFiles++;
                SourceFile file = files.stream()
                    .filter(candidate -> Path.of(unit.getSourceFile().toUri()).toAbsolutePath().normalize().equals(candidate.path()))
                    .findFirst().orElseThrow();
                String packageName = unit.getPackageName() == null ? "" : unit.getPackageName().toString();
                new TreeScanner<Void, Void>() {
                    private final Deque<String> typeNames = new ArrayDeque<>();
                    private Map<String, Object> currentClass;
                    private String currentMethod;

                    @Override
                    public Void visitClass(ClassTree node, Void unused) {
                        String simpleName = node.getSimpleName().toString();
                        typeNames.addLast(simpleName);
                        boolean isTopLevel = typeNames.size() == 1;
                        Map<String, Object> previousClass = currentClass;
                        if (isTopLevel) {
                            currentClass = new LinkedHashMap<>();
                            currentClass.put("class", simpleName);
                            currentClass.put("qualifiedName", packageName.isEmpty() ? simpleName : packageName + "." + simpleName);
                            currentClass.put("sourcePath", file.relativePath());
                            currentClass.put("sourceContentSha256", file.sha256());
                            currentClass.put("typeKind", node.getKind().name().toLowerCase());
                            currentClass.put("extends", node.getExtendsClause() == null ? null : node.getExtendsClause().toString());
                            currentClass.put("methods", new ArrayList<Map<String, Object>>());
                            classes.add(currentClass);
                        }
                        Void result = super.visitClass(node, unused);
                        typeNames.removeLast();
                        if (isTopLevel) currentClass = previousClass;
                        return result;
                    }

                    @Override
                    public Void visitMethod(MethodTree node, Void unused) {
                        if (currentClass == null) return super.visitMethod(node, unused);
                        String owner = (packageName.isEmpty() ? "" : packageName + ".") + String.join("$", typeNames);
                        boolean constructor = node.getReturnType() == null;
                        String name = constructor ? "<init>" : node.getName().toString();
                        String params = String.join(",", node.getParameters().stream()
                            .map(parameter -> parameter.getType() == null ? parameter.toString() : parameter.getType().toString())
                            .toList());
                        String signature = owner + "#" + name + "(" + params + ")"
                            + (constructor ? "-><constructor>" : "->" + node.getReturnType());
                        Map<String, Object> method = new LinkedHashMap<>();
                        method.put("signature", signature);
                        method.put("startLine", line(unit, positions.getStartPosition(unit, node)));
                        method.put("endLine", line(unit, positions.getEndPosition(unit, node)));
                        List<Map<String, Object>> branches = new ArrayList<>();
                        method.put("branches", branches);
                        if (node.getBody() != null) {
                            new BranchScanner(unit, positions, file, signature, branches).scan(node.getBody(), null);
                        }
                        @SuppressWarnings("unchecked")
                        List<Map<String, Object>> methods = (List<Map<String, Object>>) currentClass.get("methods");
                        methods.add(method);
                        return super.visitMethod(node, unused);
                    }
                }.scan(unit, null);
            }
        }
        List<Map<String, Object>> parseErrors = diagnostics.getDiagnostics().stream()
            .filter(diagnostic -> diagnostic.getKind() == Diagnostic.Kind.ERROR)
            .map(DynmapRendererBehaviorInventory::diagnosticRow)
            .toList();
        classes.sort(Comparator.comparing(row -> row.get("class").toString()));
        int methodCount = 0;
        int branchCount = 0;
        for (Map<String, Object> rendererClass : classes) {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> methods = (List<Map<String, Object>>) rendererClass.get("methods");
            methods.sort(Comparator.comparingLong((Map<String, Object> row) -> ((Number) row.get("startLine")).longValue())
                .thenComparing(row -> row.get("signature").toString()));
            methodCount += methods.size();
            for (Map<String, Object> method : methods) {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> branches = (List<Map<String, Object>>) method.get("branches");
                branches.sort(Comparator.comparingLong((Map<String, Object> row) -> ((Number) row.get("startLine")).longValue())
                    .thenComparing(row -> row.get("branchId").toString()));
                branchCount += branches.size();
            }
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("schemaVersion", 1);
        result.put("sourceRepository", "https://github.com/webbukkit/dynmap");
        result.put("sourceRevision", revision);
        result.put("sourceDirectory", RELATIVE_SOURCE_DIRECTORY);
        result.put("parser", "JDK javac public AST API; parse-only, no semantic analysis");
        result.put("sourceFileCount", files.size());
        result.put("parsedFileCount", parsedFiles);
        result.put("classCount", classes.size());
        result.put("methodCount", methodCount);
        result.put("branchSiteCount", branchCount);
        result.put("parseErrors", parseErrors);
        result.put("classes", classes);
        Files.createDirectories(output.getParent());
        Files.writeString(output, json(result) + "\n", StandardCharsets.UTF_8);
        System.out.printf("Renderer behavior inventory: files=%d parsed=%d classes=%d methods=%d branchSites=%d parseErrors=%d output=%s%n",
            files.size(), parsedFiles, classes.size(), methodCount, branchCount, parseErrors.size(), output);
        if (files.size() != parsedFiles || !parseErrors.isEmpty()) System.exit(1);
    }

    private static final class BranchScanner extends TreeScanner<Void, Void> {
        private final CompilationUnitTree unit;
        private final SourcePositions positions;
        private final SourceFile file;
        private final String methodSignature;
        private final List<Map<String, Object>> branches;

        BranchScanner(CompilationUnitTree unit, SourcePositions positions, SourceFile file, String methodSignature,
                      List<Map<String, Object>> branches) {
            this.unit = unit;
            this.positions = positions;
            this.file = file;
            this.methodSignature = methodSignature;
            this.branches = branches;
        }

        private void add(Tree node, String kind, String condition, List<Map<String, Object>> outcomes) {
            long start = positions.getStartPosition(unit, node);
            long end = positions.getEndPosition(unit, node);
            if (start < 0 || end < start) throw new IllegalStateException("Control-flow node has no stable source span: " + file.relativePath());
            long startLine = line(unit, start);
            String idSeed = file.relativePath() + "|" + methodSignature + "|" + kind + "|" + start + "|" + condition;
            String branchId = "FLOW-" + sha256(idSeed.getBytes(StandardCharsets.UTF_8)).substring(0, 16);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("branchId", branchId);
            row.put("kind", kind);
            row.put("methodSignature", methodSignature);
            row.put("startLine", startLine);
            row.put("endLine", line(unit, end));
            row.put("condition", condition);
            row.put("outcomes", outcomes);
            branches.add(row);
        }

        private Map<String, Object> outcome(String name, Tree node, String meaning) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("outcomeIdSuffix", name);
            row.put("meaning", meaning);
            row.put("startLine", node == null ? null : line(unit, positions.getStartPosition(unit, node)));
            row.put("endLine", node == null ? null : line(unit, positions.getEndPosition(unit, node)));
            return row;
        }

        @Override
        public Void visitIf(IfTree node, Void unused) {
            add(node, "if", node.getCondition().toString(), List.of(
                outcome("true", node.getThenStatement(), "condition evaluates true"),
                outcome("false", node.getElseStatement(), node.getElseStatement() == null ? "condition false; no else arm" : "condition evaluates false")));
            return super.visitIf(node, unused);
        }

        @Override
        public Void visitSwitch(SwitchTree node, Void unused) {
            addSwitch(node, node.getExpression(), node.getCases());
            return super.visitSwitch(node, unused);
        }

        @Override
        public Void visitSwitchExpression(SwitchExpressionTree node, Void unused) {
            addSwitch(node, node.getExpression(), node.getCases());
            return super.visitSwitchExpression(node, unused);
        }

        private void addSwitch(Tree node, Tree expression, List<? extends CaseTree> cases) {
            long start = positions.getStartPosition(unit, node);
            long end = positions.getEndPosition(unit, node);
            List<Map<String, Object>> outcomes = new ArrayList<>();
            for (int index = 0; index < cases.size(); index++) {
                CaseTree item = cases.get(index);
                List<String> labels = item.getLabels().stream().map(Object::toString).toList();
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("outcomeIdSuffix", "case-" + index);
                row.put("labels", labels);
                row.put("meaning", labels.contains("default")
                    ? "default selector arm; labels=" + String.join(", ", labels)
                    : "selector matches source case label(s): " + String.join(", ", labels));
                row.put("startLine", line(unit, positions.getStartPosition(unit, item)));
                row.put("endLine", line(unit, positions.getEndPosition(unit, item)));
                outcomes.add(row);
            }
            if (outcomes.stream().noneMatch(row -> row.get("labels").toString().contains("default"))) {
                Map<String, Object> unmatched = new LinkedHashMap<>();
                unmatched.put("outcomeIdSuffix", "unmatched");
                unmatched.put("labels", List.of("<no matching label and no default>"));
                unmatched.put("meaning", "selector matches no listed case label and the switch has no default arm");
                unmatched.put("startLine", null);
                unmatched.put("endLine", null);
                outcomes.add(unmatched);
            }
            String kind = node instanceof SwitchExpressionTree ? "switch_expression" : "switch_statement";
            String idSeed = file.relativePath() + "|" + methodSignature + "|" + kind + "|" + start + "|" + expression;
            Map<String, Object> record = new LinkedHashMap<>();
            record.put("branchId", "FLOW-" + sha256(idSeed.getBytes(StandardCharsets.UTF_8)).substring(0, 16));
            record.put("kind", kind);
            record.put("methodSignature", methodSignature);
            record.put("startLine", line(unit, start));
            record.put("endLine", line(unit, end));
            record.put("condition", expression.toString());
            record.put("outcomes", outcomes);
            branches.add(record);
        }

        @Override
        public Void visitConditionalExpression(ConditionalExpressionTree node, Void unused) {
            add(node, "conditional_expression", node.getCondition().toString(), List.of(
                outcome("true", node.getTrueExpression(), "condition evaluates true"),
                outcome("false", node.getFalseExpression(), "condition evaluates false")));
            return super.visitConditionalExpression(node, unused);
        }

        @Override
        public Void visitForLoop(ForLoopTree node, Void unused) {
            add(node, "for_loop", node.getCondition() == null ? "implicit_true" : node.getCondition().toString(), List.of(
                outcome("iterate", node.getStatement(), "execute body while condition is true"),
                outcome("exit", null, "condition is false")));
            return super.visitForLoop(node, unused);
        }

        @Override
        public Void visitEnhancedForLoop(EnhancedForLoopTree node, Void unused) {
            add(node, "enhanced_for_loop", node.getVariable() + " : " + node.getExpression(), List.of(
                outcome("each_element", node.getStatement(), "execute body once per iterable element"),
                outcome("empty_or_exhausted", null, "no remaining element")));
            return super.visitEnhancedForLoop(node, unused);
        }

        @Override
        public Void visitWhileLoop(WhileLoopTree node, Void unused) {
            add(node, "while_loop", node.getCondition().toString(), List.of(
                outcome("iterate", node.getStatement(), "execute body while condition is true"),
                outcome("exit", null, "condition is false")));
            return super.visitWhileLoop(node, unused);
        }

        @Override
        public Void visitDoWhileLoop(DoWhileLoopTree node, Void unused) {
            add(node, "do_while_loop", node.getCondition().toString(), List.of(
                outcome("first_iteration", node.getStatement(), "body executes before condition check"),
                outcome("repeat_or_exit", node.getStatement(), "condition selects repeat or exit")));
            return super.visitDoWhileLoop(node, unused);
        }

        @Override
        public Void visitTry(TryTree node, Void unused) {
            List<Map<String, Object>> outcomes = new ArrayList<>();
            outcomes.add(outcome("normal", node.getBlock(), "try body completes normally"));
            List<String> catchTypes = new ArrayList<>();
            for (int index = 0; index < node.getCatches().size(); index++) {
                var catchTree = node.getCatches().get(index);
                String catchType = catchTree.getParameter().toString();
                catchTypes.add(catchType);
                Map<String, Object> row = outcome("catch-" + index, catchTree.getBlock(), "exception matches " + catchType);
                outcomes.add(row);
            }
            outcomes.add(outcome("finally", node.getFinallyBlock(), node.getFinallyBlock() == null ? "no finally block" : "finally block executes when present"));
            String condition = "resources=[" + String.join(", ", node.getResources().stream().map(Object::toString).toList())
                + "]; catches=[" + String.join(", ", catchTypes) + "]; finally="
                + (node.getFinallyBlock() == null ? "absent" : "present");
            add(node, "try_catch", condition, outcomes);
            return super.visitTry(node, unused);
        }

        @Override
        public Void visitAssert(AssertTree node, Void unused) {
            add(node, "assert", node.getCondition().toString(), List.of(
                outcome("pass", node.getCondition(), "assertion condition true"),
                outcome("failure", node.getDetail(), "assertion condition false; AssertionError")));
            return super.visitAssert(node, unused);
        }

        @Override
        public Void visitClass(ClassTree node, Void unused) {
            return null;
        }
    }

    private static Map<String, Object> diagnosticRow(Diagnostic<? extends JavaFileObject> diagnostic) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("source", diagnostic.getSource() == null ? null : diagnostic.getSource().getName());
        row.put("line", diagnostic.getLineNumber());
        row.put("column", diagnostic.getColumnNumber());
        row.put("message", diagnostic.getMessage(null));
        return row;
    }

    private static long line(CompilationUnitTree unit, long position) {
        return position < 0 || unit.getLineMap() == null ? 0 : unit.getLineMap().getLineNumber(position);
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("The JDK does not provide SHA-256", exception);
        }
    }

    private static String json(Object value) {
        if (value == null) return "null";
        if (value instanceof String text) return quote(text);
        if (value instanceof Number || value instanceof Boolean) return value.toString();
        if (value instanceof Map<?, ?> map) {
            List<String> fields = new ArrayList<>();
            map.forEach((key, child) -> fields.add(quote(key.toString()) + ":" + json(child)));
            return "{" + String.join(",", fields) + "}";
        }
        if (value instanceof Iterable<?> values) {
            List<String> items = new ArrayList<>();
            values.forEach(item -> items.add(json(item)));
            return "[" + String.join(",", items) + "]";
        }
        return quote(value.toString());
    }

    private static String quote(String text) {
        StringBuilder out = new StringBuilder("\"");
        for (int index = 0; index < text.length(); index++) {
            char character = text.charAt(index);
            switch (character) {
                case '"' -> out.append("\\\"");
                case '\\' -> out.append("\\\\");
                case '\n' -> out.append("\\n");
                case '\r' -> out.append("\\r");
                case '\t' -> out.append("\\t");
                default -> {
                    if (character < 0x20) out.append(String.format("\\u%04x", (int) character));
                    else out.append(character);
                }
            }
        }
        return out.append('"').toString();
    }
}
