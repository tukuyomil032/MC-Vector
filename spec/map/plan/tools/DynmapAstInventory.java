import com.sun.source.tree.BlockTree;
import com.sun.source.tree.ClassTree;
import com.sun.source.tree.CompilationUnitTree;
import com.sun.source.tree.LiteralTree;
import com.sun.source.tree.MethodInvocationTree;
import com.sun.source.tree.MethodTree;
import com.sun.source.tree.ModifiersTree;
import com.sun.source.tree.NewClassTree;
import com.sun.source.tree.Tree;
import com.sun.source.tree.VariableTree;
import com.sun.source.util.JavacTask;
import com.sun.source.util.SourcePositions;
import com.sun.source.util.TreeScanner;
import com.sun.source.util.Trees;
import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import javax.tools.Diagnostic;
import javax.tools.DiagnosticCollector;
import javax.tools.JavaCompiler;
import javax.tools.JavaFileObject;
import javax.tools.SimpleJavaFileObject;
import javax.tools.StandardJavaFileManager;
import javax.tools.ToolProvider;

/**
 * Deterministic syntax-only inventory for a pinned Dynmap source tree.
 *
 * This uses javac's public AST API without semantic analysis, so missing
 * Bukkit/Forge/other host dependencies do not hide declarations. Reference
 * edges are syntax-derived candidates and do not prove semantic closure.
 */
public final class DynmapAstInventory {
    private static final String REFERENCE_EDGE_SEMANTICS =
        "Syntax-derived reference candidates only; they do not prove symbol resolution or semantic dependency closure";

    private DynmapAstInventory() {}

    private enum TypePlacement {
        TOP_LEVEL,
        MEMBER,
        LOCAL,
        ANONYMOUS
    }

    private record ScanContext(String typeSymbolId, String typeOwner, String lexicalContextSymbolId) {}

    private record SourceSnapshot(Path path, String relativePath, byte[] bytes, String contentSha256, String text) {
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
            System.err.println("Usage: java DynmapAstInventory.java <source-root> <output-json> <revision>");
            System.exit(2);
        }

        String sourceRootArgument = args[0];
        Path sourceRoot = Path.of(sourceRootArgument).toAbsolutePath().normalize().toRealPath();
        if (!Files.isDirectory(sourceRoot)) throw new IllegalArgumentException("Source root is not a directory: " + sourceRoot);
        Path output = Path.of(args[1]).toAbsolutePath().normalize();
        String revision = args[2];

        List<Path> javaPaths;
        try (var paths = Files.walk(sourceRoot)) {
            javaPaths = paths
                .filter(path -> Files.isRegularFile(path) && path.toString().endsWith(".java"))
                .sorted(Comparator.comparing(path -> relativePath(sourceRoot, path)))
                .toList();
        }
        List<SourceSnapshot> sourceSnapshots = new ArrayList<>(javaPaths.size());
        for (Path path : javaPaths) {
            byte[] bytes = Files.readAllBytes(path);
            sourceSnapshots.add(new SourceSnapshot(
                path,
                relativePath(sourceRoot, path),
                bytes,
                sha256(bytes),
                new String(bytes, StandardCharsets.UTF_8)));
        }

        JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
        if (compiler == null) throw new IllegalStateException("A full JDK is required for javac AST parsing");
        DiagnosticCollector<JavaFileObject> diagnostics = new DiagnosticCollector<>();
        List<Map<String, Object>> declarations = new ArrayList<>();
        List<Map<String, Object>> references = new ArrayList<>();
        List<Map<String, Object>> parseErrors = new ArrayList<>();
        int parsedFiles = 0;

        try (StandardJavaFileManager fileManager =
            compiler.getStandardFileManager(diagnostics, null, StandardCharsets.UTF_8)) {
            List<JavaFileObject> inputs = sourceSnapshots.stream()
                .map(SourceSnapshot::asJavaFileObject)
                .map(JavaFileObject.class::cast)
                .toList();
            JavacTask task = (JavacTask) compiler.getTask(
                null, fileManager, diagnostics, List.of("-proc:none", "-Xlint:none", "-encoding", "UTF-8"), null, inputs);
            Iterable<? extends CompilationUnitTree> units = task.parse();
            Trees trees = Trees.instance(task);
            SourcePositions positions = trees.getSourcePositions();
            for (CompilationUnitTree unit : units) {
                parsedFiles++;
                String file = sourcePath(sourceRoot, unit.getSourceFile());
                String packageName = unit.getPackageName() == null ? "" : unit.getPackageName().toString();
                ScanContext importContext = new ScanContext(null, "", "import:" + packageName);
                for (Tree importTree : unit.getImports()) {
                    scanReferences(importTree, importContext, file, unit, positions, declarations, references);
                }
                String packageContext = "package:" + encodedPackage(packageName);
                for (Tree declaration : unit.getTypeDecls()) {
                    if (declaration instanceof ClassTree type) {
                        scanType(
                            type,
                            packageName,
                            null,
                            null,
                            packageContext,
                            TypePlacement.TOP_LEVEL,
                            file,
                            unit,
                            positions,
                            declarations,
                            references);
                    }
                }
            }
        }

        for (Diagnostic<? extends JavaFileObject> diagnostic : diagnostics.getDiagnostics()) {
            if (diagnostic.getKind() != Diagnostic.Kind.ERROR) continue;
            Map<String, Object> row = new LinkedHashMap<>();
            JavaFileObject source = diagnostic.getSource();
            row.put("sourcePath", source == null ? null : sourcePath(sourceRoot, source));
            row.put("line", diagnostic.getLineNumber());
            row.put("column", diagnostic.getColumnNumber());
            row.put("message", diagnostic.getMessage(null));
            parseErrors.add(row);
        }

        declarations.sort(Comparator.comparing(row -> row.get("symbolId").toString()));
        references.sort(Comparator
            .comparing((Map<String, Object> row) -> row.get("sourcePath").toString())
            .thenComparingLong(row -> ((Number) row.get("line")).longValue())
            .thenComparing(row -> row.get("contextSymbolId").toString())
            .thenComparing(row -> row.get("kind").toString())
            .thenComparing(row -> row.get("target").toString()));
        List<String> duplicateSymbolIds = findDuplicateSymbolIds(declarations);

        List<Map<String, Object>> sourceFiles = new ArrayList<>(sourceSnapshots.size());
        for (SourceSnapshot snapshot : sourceSnapshots) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("sourcePath", snapshot.relativePath());
            row.put("contentSha256", snapshot.contentSha256());
            sourceFiles.add(row);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("schemaVersion", 2);
        result.put("sourceRootArgument", sourceRootArgument);
        result.put("sourceRoot", sourceRoot.toString());
        result.put("sourceRevision", revision);
        result.put("sourceRevisionProvenance", "command_line_argument; not verified against VCS metadata");
        result.put("sourceFileHashAlgorithm", "SHA-256");
        result.put("parser", "JDK javac public AST API; parse-only, no semantic analysis");
        result.put("referenceEdgeSemantics", REFERENCE_EDGE_SEMANTICS);
        result.put("semanticDependencyClosureComplete", false);
        result.put("sourceFileCount", javaPaths.size());
        result.put("parsedFileCount", parsedFiles);
        result.put("parseErrorCount", parseErrors.size());
        result.put("declarationCount", declarations.size());
        result.put("referenceCandidateCount", references.size());
        result.put("duplicateSymbolIdCount", duplicateSymbolIds.size());
        result.put("duplicateSymbolIds", duplicateSymbolIds);
        result.put("closureStatus", "candidate_ast_inventory_requires_manual_dispatch_and_dependency_audit");
        result.put("sourceFiles", sourceFiles);
        result.put("declarations", declarations);
        result.put("referenceCandidates", references);
        result.put("parseErrors", parseErrors);

        Files.createDirectories(output.getParent());
        Files.writeString(output, json(result) + "\n", StandardCharsets.UTF_8);
        long outputBytes = Files.size(output);
        System.out.printf(
            "AST inventory: files=%d parsed=%d declarations=%d references=%d parseErrors=%d duplicateSymbolIds=%d outputBytes=%d output=%s%n",
            javaPaths.size(),
            parsedFiles,
            declarations.size(),
            references.size(),
            parseErrors.size(),
            duplicateSymbolIds.size(),
            outputBytes,
            output);

        int exitCode = inventoryExitCode(javaPaths.size(), parsedFiles, parseErrors, duplicateSymbolIds);
        if (exitCode != 0) System.exit(exitCode);
    }

    private static void scanType(
        ClassTree type,
        String packageName,
        String parentTypeSymbolId,
        String parentOwner,
        String lexicalContextSymbolId,
        TypePlacement placement,
        String file,
        CompilationUnitTree unit,
        SourcePositions positions,
        List<Map<String, Object>> declarations,
        List<Map<String, Object>> references
    ) {
        String simpleName = type.getSimpleName().toString();
        long start = positions.getStartPosition(unit, type);
        if (placement != TypePlacement.TOP_LEVEL && start < 0) {
            throw new IllegalStateException("A local or anonymous type has no source position: " + file);
        }
        String owner;
        String typeId;
        switch (placement) {
            case TOP_LEVEL -> {
                owner = qualify(packageName, simpleName);
                typeId = "type:" + encodedQualifiedType(packageName, simpleName);
            }
            case MEMBER -> {
                owner = parentOwner + "$" + simpleName;
                typeId = parentTypeSymbolId + "$" + encodeIdentifier(simpleName);
            }
            case LOCAL -> {
                owner = parentOwner + "#local:" + simpleName + "@" + line(unit, start);
                typeId = "type:" + requireLexicalContext(lexicalContextSymbolId, file)
                    + "/local:" + encodeIdentifier(simpleName) + "@" + start;
            }
            case ANONYMOUS -> {
                owner = parentOwner + "#anonymous@" + line(unit, start);
                typeId = "type:" + requireLexicalContext(lexicalContextSymbolId, file) + "/anonymous@" + start;
            }
            default -> throw new IllegalStateException("Unhandled type placement: " + placement);
        }

        String kind = placement == TypePlacement.ANONYMOUS ? "class" : switch (type.getKind()) {
            case ANNOTATION_TYPE -> "annotation_type";
            case CLASS -> "class";
            case ENUM -> "enum";
            case INTERFACE -> "interface";
            case RECORD -> "record";
            default -> "other_type";
        };
        ScanContext typeContext = new ScanContext(typeId, owner, typeId);
        addDeclaration(
            declarations,
            unit,
            positions,
            file,
            typeId,
            kind,
            owner,
            owner,
            parentTypeSymbolId,
            lexicalContextSymbolId,
            type,
            type.getModifiers(),
            type.getTypeParameters().toString(),
            type.getExtendsClause(),
            type.getImplementsClause().toString(),
            null,
            null);
        scanReferences(type.getModifiers(), typeContext, file, unit, positions, declarations, references);
        scanReferences(type.getTypeParameters(), typeContext, file, unit, positions, declarations, references);
        if (type.getExtendsClause() != null) {
            scanReferences(type.getExtendsClause(), typeContext, file, unit, positions, declarations, references);
        }
        scanReferences(type.getImplementsClause(), typeContext, file, unit, positions, declarations, references);
        scanReferences(type.getPermitsClause(), typeContext, file, unit, positions, declarations, references);
        long enumConstantSeparator = type.getKind() == Tree.Kind.ENUM && placement != TypePlacement.ANONYMOUS
            ? enumConstantSeparatorOffset(type, unit, positions)
            : -1;

        for (Tree member : type.getMembers()) {
            if (member instanceof MethodTree method) {
                addMethod(method, typeId, owner, file, unit, positions, declarations, references);
            } else if (member instanceof VariableTree variable) {
                addField(variable, enumConstantSeparator, typeId, owner, file, unit, positions, declarations, references);
            } else if (member instanceof ClassTree nestedType) {
                scanType(
                    nestedType,
                    packageName,
                    typeId,
                    owner,
                    typeId,
                    TypePlacement.MEMBER,
                    file,
                    unit,
                    positions,
                    declarations,
                    references);
            } else {
                String memberContextId = typeId;
                if (member instanceof BlockTree block) {
                    memberContextId = "initializer:" + typeId
                        + (block.isStatic() ? "#static@" : "#instance@")
                        + positions.getStartPosition(unit, block);
                }
                scanReferences(
                    member,
                    new ScanContext(typeId, owner, memberContextId),
                    file,
                    unit,
                    positions,
                    declarations,
                    references);
            }
        }
    }

    private static void addMethod(
        MethodTree method,
        String typeId,
        String owner,
        String file,
        CompilationUnitTree unit,
        SourcePositions positions,
        List<Map<String, Object>> declarations,
        List<Map<String, Object>> references
    ) {
        boolean constructor = method.getReturnType() == null;
        String name = constructor ? "<init>" : method.getName().toString();
        List<String> parameterTypes = method.getParameters().stream()
            .map(DynmapAstInventory::parameterType)
            .toList();
        String parameterTypeList = String.join(",", parameterTypes);
        String parameterDetails = String.join(",", method.getParameters().stream().map(Object::toString).toList());
        String returnType = constructor ? "<constructor>" : method.getReturnType().toString();
        String signature = owner + "#" + name + "(" + parameterTypeList + ")->" + returnType;
        String idKind = constructor ? "constructor" : "method";
        String id = idKind + ":" + typeId + "#" + encodeIdentifier(name) + "("
            + String.join(",", parameterTypes.stream().map(DynmapAstInventory::encodeIdentifier).toList())
            + ")";
        ScanContext methodContext = new ScanContext(typeId, owner, id);
        addDeclaration(
            declarations,
            unit,
            positions,
            file,
            id,
            idKind,
            signature,
            owner,
            typeId,
            typeId,
            method,
            method.getModifiers(),
            method.getTypeParameters().toString(),
            method.getReturnType(),
            method.getThrows().toString(),
            parameterDetails,
            method.getDefaultValue());
        scanReferences(method.getModifiers(), methodContext, file, unit, positions, declarations, references);
        scanReferences(method.getTypeParameters(), methodContext, file, unit, positions, declarations, references);
        if (method.getReturnType() != null) {
            scanReferences(method.getReturnType(), methodContext, file, unit, positions, declarations, references);
        }
        for (VariableTree parameter : method.getParameters()) {
            scanReferences(parameter, methodContext, file, unit, positions, declarations, references);
        }
        scanReferences(method.getThrows(), methodContext, file, unit, positions, declarations, references);
        if (method.getDefaultValue() != null) {
            scanReferences(method.getDefaultValue(), methodContext, file, unit, positions, declarations, references);
        }
        if (method.getBody() != null) {
            scanReferences(method.getBody(), methodContext, file, unit, positions, declarations, references);
        }
    }

    private static String parameterType(VariableTree parameter) {
        String type = parameter.getType() == null ? parameter.toString() : parameter.getType().toString();
        if (parameter.toString().contains("...") && type.endsWith("[]")) {
            return type.substring(0, type.length() - 2) + "...";
        }
        return type;
    }

    private static void addField(
        VariableTree variable,
        long enumConstantSeparator,
        String typeId,
        String owner,
        String file,
        CompilationUnitTree unit,
        SourcePositions positions,
        List<Map<String, Object>> declarations,
        List<Map<String, Object>> references
    ) {
        boolean enumConstant = enumConstantSeparator >= 0
            && positions.getStartPosition(unit, variable) < enumConstantSeparator;
        String kind = enumConstant ? "enum_constant" : "field";
        String name = variable.getName().toString();
        String id = kind + ":" + typeId + "#" + encodeIdentifier(name);
        String fieldType = variable.getType() == null ? null : variable.getType().toString();
        addDeclaration(
            declarations,
            unit,
            positions,
            file,
            id,
            kind,
            owner + "#" + name + ":" + (fieldType == null ? "<enum-constant>" : fieldType),
            owner,
            typeId,
            typeId,
            variable,
            variable.getModifiers(),
            "[]",
            variable.getType(),
            "[]",
            null,
            variable.getInitializer());
        ScanContext fieldContext = new ScanContext(typeId, owner, id);
        scanReferences(variable.getModifiers(), fieldContext, file, unit, positions, declarations, references);
        if (variable.getType() != null) {
            scanReferences(variable.getType(), fieldContext, file, unit, positions, declarations, references);
        }
        if (variable.getInitializer() != null) {
            scanReferences(variable.getInitializer(), fieldContext, file, unit, positions, declarations, references);
        }
    }

    private static void addDeclaration(
        List<Map<String, Object>> declarations,
        CompilationUnitTree unit,
        SourcePositions positions,
        String file,
        String id,
        String kind,
        String signature,
        String owner,
        String ownerSymbolId,
        String lexicalContextSymbolId,
        Tree sourceNode,
        ModifiersTree modifiers,
        String typeParameters,
        Tree resultType,
        String additionalTypes,
        String parameters,
        Tree initializer
    ) {
        long start = positions.getStartPosition(unit, sourceNode);
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("symbolId", id);
        row.put("kind", kind);
        row.put("signature", signature);
        row.put("owner", owner);
        row.put("ownerSymbolId", ownerSymbolId);
        row.put("lexicalContextSymbolId", lexicalContextSymbolId);
        row.put("sourcePath", file);
        row.put("startOffset", start);
        row.put("endOffset", positions.getEndPosition(unit, sourceNode));
        row.put("startLine", line(unit, start));
        row.put("endLine", line(unit, positions.getEndPosition(unit, sourceNode)));
        row.put("modifiers", modifiers == null ? List.of() : modifiers.getFlags().stream()
            .map(flag -> flag.name().toLowerCase())
            .sorted()
            .toList());
        row.put("annotations", modifiers == null ? List.of() : modifiers.getAnnotations().stream().map(Object::toString).toList());
        row.put("typeParameters", typeParameters);
        row.put("resultOrFieldType", resultType == null ? null : resultType.toString());
        row.put("relatedTypesOrThrows", additionalTypes);
        row.put("parameters", parameters);
        row.put("initializer", initializer == null ? null : initializer.toString());
        declarations.add(row);
    }

    private static void scanReferences(
        Tree tree,
        ScanContext context,
        String file,
        CompilationUnitTree unit,
        SourcePositions positions,
        List<Map<String, Object>> declarations,
        List<Map<String, Object>> references
    ) {
        if (tree == null) return;
        TreeScanner<Void, Void> scanner = new TreeScanner<>() {
            private void add(Tree node, String kind, String target) {
                long start = positions.getStartPosition(unit, node);
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("sourcePath", file);
                row.put("startOffset", start);
                row.put("endOffset", positions.getEndPosition(unit, node));
                row.put("line", line(unit, start));
                row.put("contextSymbolId", context.lexicalContextSymbolId());
                row.put("kind", kind);
                row.put("target", target);
                references.add(row);
            }

            @Override
            public Void visitMethodInvocation(MethodInvocationTree node, Void unused) {
                add(node, "method_call_candidate", node.getMethodSelect().toString());
                return super.visitMethodInvocation(node, unused);
            }

            @Override
            public Void visitNewClass(NewClassTree node, Void unused) {
                add(node, "constructor_call_candidate", node.getIdentifier().toString());
                return super.visitNewClass(node, unused);
            }

            @Override
            public Void visitLiteral(LiteralTree node, Void unused) {
                Object value = node.getValue();
                if (value instanceof String text) add(node, "string_literal_candidate", text);
                return super.visitLiteral(node, unused);
            }

            @Override
            public Void visitMemberSelect(com.sun.source.tree.MemberSelectTree node, Void unused) {
                add(node, "member_select_candidate", node.toString());
                return super.visitMemberSelect(node, unused);
            }

            @Override
            public Void visitIdentifier(com.sun.source.tree.IdentifierTree node, Void unused) {
                add(node, "identifier_candidate", node.getName().toString());
                return super.visitIdentifier(node, unused);
            }

            @Override
            public Void visitClass(ClassTree node, Void unused) {
                TypePlacement placement = node.getSimpleName().isEmpty()
                    ? TypePlacement.ANONYMOUS
                    : TypePlacement.LOCAL;
                scanType(
                    node,
                    "",
                    context.typeSymbolId(),
                    context.typeOwner(),
                    context.lexicalContextSymbolId(),
                    placement,
                    file,
                    unit,
                    positions,
                    declarations,
                    references);
                return null;
            }
        };
        scanner.scan(tree, null);
    }

    private static void scanReferences(
        Iterable<? extends Tree> trees,
        ScanContext context,
        String file,
        CompilationUnitTree unit,
        SourcePositions positions,
        List<Map<String, Object>> declarations,
        List<Map<String, Object>> references
    ) {
        if (trees == null) return;
        for (Tree tree : trees) {
            scanReferences(tree, context, file, unit, positions, declarations, references);
        }
    }

    static List<String> findDuplicateSymbolIds(List<Map<String, Object>> declarations) {
        Map<String, Integer> occurrences = new TreeMap<>();
        for (Map<String, Object> declaration : declarations) {
            Object rawId = declaration.get("symbolId");
            if (!(rawId instanceof String symbolId) || symbolId.isEmpty()) {
                throw new IllegalArgumentException("Every declaration must have a non-empty symbolId");
            }
            occurrences.merge(symbolId, 1, Integer::sum);
        }
        return occurrences.entrySet().stream()
            .filter(entry -> entry.getValue() > 1)
            .map(Map.Entry::getKey)
            .toList();
    }

    static int inventoryExitCode(
        int sourceFileCount,
        int parsedFileCount,
        List<Map<String, Object>> parseErrors,
        List<String> duplicateSymbolIds
    ) {
        return parsedFileCount != sourceFileCount || !parseErrors.isEmpty() || !duplicateSymbolIds.isEmpty() ? 1 : 0;
    }

    private static String requireLexicalContext(String lexicalContextSymbolId, String file) {
        if (lexicalContextSymbolId == null || lexicalContextSymbolId.isEmpty()) {
            throw new IllegalStateException("A local or anonymous type has no lexical context: " + file);
        }
        return lexicalContextSymbolId;
    }

    private static long enumConstantSeparatorOffset(
        ClassTree enumType,
        CompilationUnitTree unit,
        SourcePositions positions
    ) {
        String source;
        try {
            source = unit.getSourceFile().getCharContent(true).toString();
        } catch (IOException exception) {
            throw new IllegalStateException("Cannot read the parsed enum source", exception);
        }
        int sourceStart = Math.toIntExact(positions.getStartPosition(unit, enumType));
        int sourceEnd = Math.toIntExact(positions.getEndPosition(unit, enumType));
        int enumKeywordEnd = findJavaKeyword(source, sourceStart, sourceEnd, "enum");
        if (enumKeywordEnd < 0) throw new IllegalStateException("Cannot locate enum keyword in parsed source");
        int bodyStart = findEnumBodyStart(source, enumKeywordEnd, sourceEnd);
        if (bodyStart < 0) throw new IllegalStateException("Cannot locate enum body in parsed source");
        return findEnumConstantSeparator(source, bodyStart + 1, sourceEnd);
    }

    private static int findJavaKeyword(String source, int start, int end, String keyword) {
        int cursor = start;
        while (cursor < end) {
            int skipped = skipCommentOrLiteral(source, cursor, end);
            if (skipped != cursor) {
                cursor = skipped;
                continue;
            }
            char character = source.charAt(cursor);
            if (Character.isJavaIdentifierStart(character)) {
                int tokenEnd = cursor + 1;
                while (tokenEnd < end && Character.isJavaIdentifierPart(source.charAt(tokenEnd))) tokenEnd++;
                if (source.regionMatches(cursor, keyword, 0, keyword.length()) && tokenEnd - cursor == keyword.length()) {
                    return tokenEnd;
                }
                cursor = tokenEnd;
            } else {
                cursor++;
            }
        }
        return -1;
    }

    private static int findEnumBodyStart(String source, int start, int end) {
        int parentheses = 0;
        int cursor = start;
        while (cursor < end) {
            int skipped = skipCommentOrLiteral(source, cursor, end);
            if (skipped != cursor) {
                cursor = skipped;
                continue;
            }
            char character = source.charAt(cursor);
            if (character == '(') parentheses++;
            else if (character == ')') parentheses = Math.max(0, parentheses - 1);
            else if (character == '{' && parentheses == 0) return cursor;
            cursor++;
        }
        return -1;
    }

    private static long findEnumConstantSeparator(String source, int start, int end) {
        int braces = 1;
        int parentheses = 0;
        int brackets = 0;
        int cursor = start;
        while (cursor < end) {
            int skipped = skipCommentOrLiteral(source, cursor, end);
            if (skipped != cursor) {
                cursor = skipped;
                continue;
            }
            char character = source.charAt(cursor);
            switch (character) {
                case '{' -> braces++;
                case '}' -> {
                    braces--;
                    if (braces == 0) return Long.MAX_VALUE;
                }
                case '(' -> parentheses++;
                case ')' -> parentheses = Math.max(0, parentheses - 1);
                case '[' -> brackets++;
                case ']' -> brackets = Math.max(0, brackets - 1);
                case ';' -> {
                    if (braces == 1 && parentheses == 0 && brackets == 0) return cursor;
                }
                default -> { }
            }
            cursor++;
        }
        return Long.MAX_VALUE;
    }

    private static int skipCommentOrLiteral(String source, int start, int end) {
        char first = source.charAt(start);
        if (first == '/' && start + 1 < end) {
            char second = source.charAt(start + 1);
            if (second == '/') {
                int newline = source.indexOf('\n', start + 2);
                return newline < 0 || newline >= end ? end : newline + 1;
            }
            if (second == '*') {
                int close = source.indexOf("*/", start + 2);
                return close < 0 || close + 2 > end ? end : close + 2;
            }
        }
        boolean textBlock = first == '"' && start + 2 < end && source.startsWith("\"\"\"", start);
        if (first != '\'' && first != '"') return start;
        int cursor = start + (textBlock ? 3 : 1);
        while (cursor < end) {
            if (source.charAt(cursor) == '\\') {
                cursor = Math.min(end, cursor + 2);
            } else if (textBlock && source.startsWith("\"\"\"", cursor)) {
                return cursor + 3;
            } else if (!textBlock && source.charAt(cursor) == first) {
                return cursor + 1;
            } else {
                cursor++;
            }
        }
        return end;
    }

    private static String sourcePath(Path sourceRoot, JavaFileObject source) {
        return relativePath(sourceRoot, Path.of(source.toUri()).toAbsolutePath().normalize());
    }

    private static String relativePath(Path sourceRoot, Path path) {
        return sourceRoot.relativize(path).toString().replace('\\', '/');
    }

    private static String qualify(String packageName, String simpleName) {
        return packageName.isEmpty() ? simpleName : packageName + "." + simpleName;
    }

    private static String encodedQualifiedType(String packageName, String simpleName) {
        return (packageName.isEmpty() ? "" : encodedPackage(packageName) + ".") + encodeIdentifier(simpleName);
    }

    private static String encodedPackage(String packageName) {
        if (packageName.isEmpty()) return "";
        return String.join(".", java.util.Arrays.stream(packageName.split("\\.", -1))
            .map(DynmapAstInventory::encodeIdentifier)
            .toList());
    }

    private static String encodeIdentifier(String value) {
        byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
        StringBuilder encoded = new StringBuilder(bytes.length);
        for (byte item : bytes) {
            int unsigned = item & 0xff;
            if ((unsigned >= 'a' && unsigned <= 'z') || (unsigned >= 'A' && unsigned <= 'Z')
                || (unsigned >= '0' && unsigned <= '9') || unsigned == '_') {
                encoded.append((char) unsigned);
            } else {
                encoded.append('%');
                encoded.append(Character.forDigit((unsigned >>> 4) & 0xf, 16));
                encoded.append(Character.forDigit(unsigned & 0xf, 16));
            }
        }
        return encoded.toString();
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("The JDK does not provide SHA-256", exception);
        }
    }

    private static long line(CompilationUnitTree unit, long position) {
        return position < 0 || unit.getLineMap() == null ? 0 : unit.getLineMap().getLineNumber(position);
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
