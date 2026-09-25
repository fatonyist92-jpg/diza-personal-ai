plugins { id("com.android.application") }

android {
    namespace = "com.dizabot.app"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.dizabot.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 4
        versionName = "0.4.0"
    }
    buildTypes { release { isMinifyEnabled = false } }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.work:work-runtime:2.9.1")
}
