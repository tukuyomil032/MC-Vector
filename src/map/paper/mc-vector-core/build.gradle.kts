plugins {
    java
}

group = "com.mcvector"

val requestedCoreVersion = providers.gradleProperty("coreVersion")
requestedCoreVersion.orNull?.let {
    check(it.matches(Regex("[0-9]+\\.[0-9]+\\.[0-9]+"))) {
        "coreVersion must be an exact semantic release version"
    }
}
val coreVersion = requestedCoreVersion.orElse("0.1.0")
version = coreVersion.get()

java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(21))
    }
}

dependencies {
    compileOnly("io.papermc.paper:paper-api:1.21.10-R0.1-SNAPSHOT")
    testImplementation(platform("org.junit:junit-bom:6.0.1"))
    testImplementation("org.junit.jupiter:junit-jupiter")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
    testImplementation("org.mockbukkit.mockbukkit:mockbukkit-v1.21:4.98.0")
    testImplementation("io.papermc.paper:paper-api:1.21.10-R0.1-SNAPSHOT")
}

tasks.withType<JavaCompile>().configureEach {
    options.release.set(21)
    options.encoding = "UTF-8"
}

tasks.test {
    useJUnitPlatform()
}

tasks.processResources {
    filesMatching("plugin.yml") {
        expand("coreVersion" to project.version.toString())
    }
}

tasks.jar {
    archiveBaseName.set("mc-vector-core")
    archiveVersion.set(project.version.toString())
}
