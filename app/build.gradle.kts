plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

fun String.asBuildConfigString(): String =
    "\"" + replace("\\", "\\\\").replace("\"", "\\\"") + "\""

val realtimeBackendUrl = providers.gradleProperty("DIZA_REALTIME_BACKEND_URL")
    .orElse("")
    .get()

android {
    namespace = "com.fatoni.diza"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.fatoni.diza"
        minSdk = 26
        targetSdk = 35
        versionCode = 5
        versionName = "0.2.3"
        buildConfigField(
            "String",
            "DIZA_REALTIME_BACKEND_URL",
            realtimeBackendUrl.asBuildConfigString()
        )
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2025.05.01"))
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.9.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.9.0")
    implementation("androidx.webkit:webkit:1.13.0")
    debugImplementation("androidx.compose.ui:ui-tooling")
}


kotlin {
    jvmToolchain(17)
}
