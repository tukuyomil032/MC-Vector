import com.sun.source.tree.CompilationUnitTree;
import com.sun.source.tree.IdentifierTree;
import com.sun.source.tree.LiteralTree;
import com.sun.source.tree.MemberSelectTree;
import com.sun.source.tree.MethodInvocationTree;
import com.sun.source.tree.MethodTree;
import com.sun.source.tree.NewClassTree;
import com.sun.source.tree.Tree;
import com.sun.source.util.JavacTask;
import com.sun.source.util.SourcePositions;
import com.sun.source.util.TreePath;
import com.sun.source.util.TreePathScanner;
import com.sun.source.util.Trees;

import javax.lang.model.element.Element;
import javax.lang.model.element.ExecutableElement;
import javax.lang.model.element.TypeElement;
import javax.lang.model.util.Elements;
import javax.tools.Diagnostic;
import javax.tools.DiagnosticCollector;
import javax.tools.JavaCompiler;
import javax.tools.JavaFileObject;
import javax.tools.StandardJavaFileManager;
import javax.tools.ToolProvider;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;

/**
 * Emits source-attribution evidence for the syntax-only Dynmap AST inventory.
 * This tool deliberately never claims renderer closure: reflection, resource
 * lookup, generated dispatch, and unresolved compiler symbols remain explicit.
 */
public final class DynmapSemanticReferenceInventory {
    private static final String PINNED_REVISION = "93b454efb8802dc7406d6873434f2aeec5c636f4";

    private DynmapSemanticReferenceInventory() { }

    public static void main(String[] args) throws Exception {
        if (args.length != 3) {
            throw new IllegalArgumentException("Usage: java DynmapSemanticReferenceInventory.java <source-root> <output-json> <pinned-revision>");
        }
        Path root = Path.of(args[0]).toRealPath();
        Path output = Path.of(args[1]).toAbsolutePath().normalize();
        if (!PINNED_REVISION.equals(args[2])) {
            throw new IllegalArgumentException("Unexpected pinned revision");
        }
        JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
        if (compiler == null) throw new IllegalStateException("A full JDK is required");

        List<Path> sourcePaths;
        try (var paths = Files.walk(root)) {
            sourcePaths = paths.filter(path -> Files.isRegularFile(path) && path.toString().endsWith(".java"))
                .sorted(Comparator.comparing(path -> relative(root, path)))
                .toList();
        }
        DiagnosticCollector<JavaFileObject> diagnostics = new DiagnosticCollector<>();
        List<Map<String, Object>> references = new ArrayList<>();
        List<CompilationUnitTree> units;
        int parseDiagnosticCount;
        int analyzeExceptionCount = 0;
        String analyzeExceptionClass = null;
        Map<String, Integer> parseDiagnosticCodes = new TreeMap<>();
        Map<String, Integer> analyzeDiagnosticCodes = new TreeMap<>();

        try (StandardJavaFileManager fileManager = compiler.getStandardFileManager(diagnostics, Locale.ROOT, StandardCharsets.UTF_8)) {
            Iterable<? extends JavaFileObject> files = fileManager.getJavaFileObjectsFromPaths(sourcePaths);
            JavacTask task = (JavacTask) compiler.getTask(null, fileManager, diagnostics,
                List.of("-proc:none", "-Xlint:none", "-encoding", "UTF-8"), null, files);
            List<CompilationUnitTree> parsed = new ArrayList<>();
            for (CompilationUnitTree unit : task.parse()) parsed.add(unit);
            units = List.copyOf(parsed);
            parseDiagnosticCount = diagnostics.getDiagnostics().size();
            countDiagnosticCodes(diagnostics.getDiagnostics(), 0, parseDiagnosticCount, parseDiagnosticCodes);

            try {
                task.analyze();
            } catch (RuntimeException | LinkageError exception) {
                analyzeExceptionCount++;
                analyzeExceptionClass = exception.getClass().getName();
            }
            List<Diagnostic<? extends JavaFileObject>> allDiagnostics = diagnostics.getDiagnostics();
            countDiagnosticCodes(allDiagnostics, parseDiagnosticCount, allDiagnostics.size(), analyzeDiagnosticCodes);

            Trees trees = Trees.instance(task);
            Elements elements = task.getElements();
            SourcePositions positions = trees.getSourcePositions();
            for (CompilationUnitTree unit : units) {
                Path unitPath = pathFor(root, unit.getSourceFile());
                if (unitPath == null) continue;
                String sourcePath = relative(root, unitPath);
                new ReferenceScanner(root, sourcePath, unit, trees, elements, positions, references).scan(unit, null);
            }
        }

        references.sort(Comparator.comparing((Map<String, Object> row) -> row.get("sourcePath").toString())
            .thenComparingLong(row -> ((Number) row.get("startOffset")).longValue())
            .thenComparing(row -> row.get("kind").toString()));
        Map<String, Integer> resolutionCounts = new TreeMap<>();
        Map<String, Integer> kindCounts = new TreeMap<>();
        for (Map<String, Object> row : references) {
            increment(resolutionCounts, row.get("resolution").toString());
            increment(kindCounts, row.get("kind").toString());
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("schemaVersion", 1);
        result.put("sourceRepository", "https://github.com/webbukkit/dynmap");
        result.put("sourceRevision", PINNED_REVISION);
        result.put("parser", "JDK javac public Tree API with JavacTask.analyze");
        result.put("compilerVersion", System.getProperty("java.version"));
        result.put("sourceRootIdentity", "external-path-redacted");
        result.put("status", "attribution_inventory_only_closure_open");
        result.put("closureComplete", false);
        result.put("counts", Map.of(
            "sourceFiles", sourcePaths.size(),
            "parsedFiles", units.size(),
            "parseDiagnostics", parseDiagnosticCount,
            "analysisDiagnostics", Math.max(0, diagnostics.getDiagnostics().size() - parseDiagnosticCount),
            "analysisExceptions", analyzeExceptionCount,
            "references", references.size(),
            "resolution", resolutionCounts,
            "kinds", kindCounts));
        result.put("diagnosticCodes", Map.of("parse", parseDiagnosticCodes, "analysis", analyzeDiagnosticCodes));
        result.put("analysisExceptionClass", analyzeExceptionClass);
        result.put("references", references);

        Files.createDirectories(output.getParent());
        Files.writeString(output, json(result) + "\n", StandardCharsets.UTF_8);
        System.out.printf(Locale.ROOT,
            "Semantic reference inventory: files=%d parsed=%d refs=%d resolutions=%s parseDiagnostics=%d analysisDiagnostics=%d closure=OPEN output=%s%n",
            sourcePaths.size(), units.size(), references.size(), resolutionCounts,
            parseDiagnosticCount, Math.max(0, diagnostics.getDiagnostics().size() - parseDiagnosticCount), output.getFileName());
    }

    private static final class ReferenceScanner extends TreePathScanner<Void, Void> {
        private final Path root;
        private final String sourcePath;
        private final CompilationUnitTree unit;
        private final Trees trees;
        private final Elements elements;
        private final SourcePositions positions;
        private final List<Map<String, Object>> output;
        private String contextType = "";
        private String contextTypeBinaryName = "";
        private long contextTypeStartOffset = -1;
        private long contextTypeEndOffset = -1;
        private String contextMethod = "";
        private long contextMethodStartOffset = -1;
        private long contextMethodEndOffset = -1;

        ReferenceScanner(Path root, String sourcePath, CompilationUnitTree unit, Trees trees,
                         Elements elements, SourcePositions positions, List<Map<String, Object>> output) {
            this.root = root;
            this.sourcePath = sourcePath;
            this.unit = unit;
            this.trees = trees;
            this.elements = elements;
            this.positions = positions;
            this.output = output;
        }

        @Override
        public Void visitMethod(MethodTree node, Void unused) {
            String previous = contextMethod;
            long previousStart = contextMethodStartOffset;
            long previousEnd = contextMethodEndOffset;
            Element element = trees.getElement(getCurrentPath());
            contextMethod = element instanceof ExecutableElement executable ? executable.toString() : node.getName().toString();
            contextMethodStartOffset = positions.getStartPosition(unit, node);
            contextMethodEndOffset = positions.getEndPosition(unit, node);
            try { return super.visitMethod(node, unused); }
            finally {
                contextMethod = previous;
                contextMethodStartOffset = previousStart;
                contextMethodEndOffset = previousEnd;
            }
        }

        @Override
        public Void visitClass(com.sun.source.tree.ClassTree node, Void unused) {
            String previous = contextType;
            String previousBinaryName = contextTypeBinaryName;
            long previousStart = contextTypeStartOffset;
            long previousEnd = contextTypeEndOffset;
            Element element = trees.getElement(getCurrentPath());
            contextTypeStartOffset = positions.getStartPosition(unit, node);
            contextTypeEndOffset = positions.getEndPosition(unit, node);
            if (element instanceof TypeElement type) {
                contextType = type.getQualifiedName().toString();
                contextTypeBinaryName = elements.getBinaryName(type).toString();
            }
            try { return super.visitClass(node, unused); }
            finally {
                contextType = previous;
                contextTypeBinaryName = previousBinaryName;
                contextTypeStartOffset = previousStart;
                contextTypeEndOffset = previousEnd;
            }
        }

        @Override
        public Void visitMethodInvocation(MethodInvocationTree node, Void unused) {
            add(node, "method_call", trees.getElement(getCurrentPath()));
            return super.visitMethodInvocation(node, unused);
        }

        @Override
        public Void visitNewClass(NewClassTree node, Void unused) {
            add(node, "constructor_call", trees.getElement(getCurrentPath()));
            return super.visitNewClass(node, unused);
        }

        @Override
        public Void visitMemberSelect(MemberSelectTree node, Void unused) {
            add(node, "member_select", trees.getElement(getCurrentPath()));
            return super.visitMemberSelect(node, unused);
        }

        @Override
        public Void visitIdentifier(IdentifierTree node, Void unused) {
            add(node, "identifier", trees.getElement(getCurrentPath()));
            return super.visitIdentifier(node, unused);
        }

        @Override
        public Void visitLiteral(LiteralTree node, Void unused) {
            if (node.getValue() instanceof String value) {
                Map<String, Object> row = base(node, "string_literal");
                row.put("literal", value);
                row.put("enclosingCalls", enclosingCalls(node));
                row.put("resolution", "manual_reflection_or_resource_review_required");
                output.add(row);
            }
            return super.visitLiteral(node, unused);
        }

        private List<Map<String, Object>> enclosingCalls(Tree literal) {
            List<Map<String, Object>> calls = new ArrayList<>();
            long literalStart = positions.getStartPosition(unit, literal);
            long literalEnd = positions.getEndPosition(unit, literal);
            TreePath cursor = getCurrentPath().getParentPath();
            while (cursor != null && calls.size() < 8) {
                Tree node = cursor.getLeaf();
                List<? extends Tree> arguments;
                String kind;
                if (node instanceof MethodInvocationTree invocation) {
                    arguments = invocation.getArguments();
                    kind = "method_call";
                } else if (node instanceof NewClassTree constructor) {
                    arguments = constructor.getArguments();
                    kind = "constructor_call";
                } else {
                    cursor = cursor.getParentPath();
                    continue;
                }

                int argumentIndex = -1;
                for (int index = 0; index < arguments.size(); index++) {
                    long argumentStart = positions.getStartPosition(unit, arguments.get(index));
                    long argumentEnd = positions.getEndPosition(unit, arguments.get(index));
                    if (argumentStart <= literalStart && literalEnd <= argumentEnd) {
                        argumentIndex = index;
                        break;
                    }
                }
                Element target = trees.getElement(cursor);
                Map<String, Object> call = new LinkedHashMap<>();
                call.put("kind", kind);
                String callee = node instanceof MethodInvocationTree invocation
                    ? invocation.getMethodSelect().toString()
                    : ((NewClassTree) node).getIdentifier().toString();
                call.put("callee", callee);
                call.put("targetSignature", target == null ? null : target.toString());
                if (target instanceof ExecutableElement executable) {
                    call.put("targetName", executable.getSimpleName().toString());
                    Element owner = executable.getEnclosingElement();
                    if (owner instanceof TypeElement ownerType) {
                        call.put("targetOwnerQualifiedName", ownerType.getQualifiedName().toString());
                        call.put("targetOwnerBinaryName", elements.getBinaryName(ownerType).toString());
                    }
                }
                call.put("startOffset", positions.getStartPosition(unit, node));
                call.put("endOffset", positions.getEndPosition(unit, node));
                call.put("line", line(unit, positions.getStartPosition(unit, node)));
                call.put("argumentIndex", argumentIndex);
                calls.add(call);
                cursor = cursor.getParentPath();
            }
            return calls;
        }

        private void add(Tree node, String kind, Element target) {
            Map<String, Object> row = base(node, kind);
            if (target == null) {
                String expression = node.toString();
                boolean implicitSuperDispatch = ("identifier".equals(kind) && "super".equals(expression))
                    || ("method_call".equals(kind) && (expression.startsWith("super(") || expression.startsWith("this(")));
                row.put("resolution", implicitSuperDispatch ? "manual_super_or_this_constructor_resolution_required" : "unresolved");
            } else {
                row.put("targetKind", target.getKind().name().toLowerCase(Locale.ROOT));
                row.put("targetSignature", target.toString());
                Element owner = target instanceof TypeElement ? target : target.getEnclosingElement();
                if (owner instanceof TypeElement ownerType) {
                    row.put("targetOwnerBinaryName", elements.getBinaryName(ownerType).toString());
                }
                TreePath targetPath = trees.getPath(target);
                if (targetPath == null || targetPath.getCompilationUnit().getSourceFile() == null) {
                    row.put("resolution", "external_or_generated_declaration");
                } else {
                    Path targetFile = pathFor(root, targetPath.getCompilationUnit().getSourceFile());
                    if (targetFile == null) {
                        row.put("resolution", "source_target_outside_pinned_root");
                    } else {
                        row.put("resolution", "resolved_pinned_source_declaration");
                        row.put("targetSourcePath", relative(root, targetFile));
                        long targetStart = positions.getStartPosition(targetPath.getCompilationUnit(), targetPath.getLeaf());
                        long targetEnd = positions.getEndPosition(targetPath.getCompilationUnit(), targetPath.getLeaf());
                        row.put("targetStartOffset", targetStart);
                        row.put("targetEndOffset", targetEnd);
                        row.put("targetStartLine", line(targetPath.getCompilationUnit(), targetStart));
                        row.put("targetEndLine", line(targetPath.getCompilationUnit(), targetEnd));
                    }
                }
            }
            output.add(row);
        }

        private Map<String, Object> base(Tree node, String kind) {
            long start = positions.getStartPosition(unit, node);
            long end = positions.getEndPosition(unit, node);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("sourcePath", sourcePath);
            row.put("line", line(unit, start));
            row.put("startOffset", start);
            row.put("endOffset", end);
            row.put("kind", kind);
            row.put("sourceExpression", node.toString());
            row.put("contextType", contextType);
            row.put("contextTypeBinaryName", contextTypeBinaryName);
            row.put("contextTypeStartOffset", contextTypeStartOffset);
            row.put("contextTypeEndOffset", contextTypeEndOffset);
            row.put("contextMethod", contextMethod);
            row.put("contextMethodStartOffset", contextMethodStartOffset);
            row.put("contextMethodEndOffset", contextMethodEndOffset);
            return row;
        }
    }

    private static void countDiagnosticCodes(List<Diagnostic<? extends JavaFileObject>> diagnostics,
                                             int start, int end, Map<String, Integer> counts) {
        for (int index = start; index < end; index++) {
            Diagnostic<? extends JavaFileObject> diagnostic = diagnostics.get(index);
            String key = diagnostic.getKind().name().toLowerCase(Locale.ROOT) + ":" + diagnostic.getCode();
            increment(counts, key);
        }
    }

    private static void increment(Map<String, Integer> counts, String key) {
        counts.merge(key, 1, Integer::sum);
    }

    private static Path pathFor(Path root, JavaFileObject source) {
        try {
            Path path = Path.of(source.toUri()).toAbsolutePath().normalize();
            if (!path.startsWith(root)) return null;
            return path;
        } catch (RuntimeException exception) {
            return null;
        }
    }

    private static String relative(Path root, Path path) {
        return root.relativize(path.toAbsolutePath().normalize()).toString().replace(path.getFileSystem().getSeparator(), "/");
    }

    private static int line(CompilationUnitTree unit, long offset) {
        return offset < 0 ? -1 : (int) unit.getLineMap().getLineNumber(offset);
    }

    private static String json(Object value) {
        if (value == null) return "null";
        if (value instanceof String text) return quote(text);
        if (value instanceof Number || value instanceof Boolean) return value.toString();
        if (value instanceof Map<?, ?> map) {
            List<String> parts = new ArrayList<>();
            for (Map.Entry<?, ?> entry : map.entrySet()) parts.add(quote(entry.getKey().toString()) + ":" + json(entry.getValue()));
            return "{" + String.join(",", parts) + "}";
        }
        if (value instanceof Iterable<?> values) {
            List<String> parts = new ArrayList<>();
            for (Object item : values) parts.add(json(item));
            return "[" + String.join(",", parts) + "]";
        }
        throw new IllegalArgumentException("Unsupported JSON value type: " + value.getClass().getName());
    }

    private static String quote(String text) {
        StringBuilder result = new StringBuilder("\"");
        for (int index = 0; index < text.length(); index++) {
            char value = text.charAt(index);
            switch (value) {
                case '"' -> result.append("\\\"");
                case '\\' -> result.append("\\\\");
                case '\b' -> result.append("\\b");
                case '\f' -> result.append("\\f");
                case '\n' -> result.append("\\n");
                case '\r' -> result.append("\\r");
                case '\t' -> result.append("\\t");
                default -> {
                    if (value < 0x20) result.append(String.format(Locale.ROOT, "\\u%04x", (int) value));
                    else result.append(value);
                }
            }
        }
        return result.append('"').toString();
    }
}
