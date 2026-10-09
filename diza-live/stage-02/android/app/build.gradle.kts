plugins { id("com.android.application") }

android {
    namespace = "app.diza.live.voice"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.diza.live.voice.prototype"
        minSdk = 26
        targetSdk = 35
        versionCode = 3
        versionName = "0.2.1-stage2-agentfix"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildTypes {
        getByName("release") { isMinifyEnabled = false }
    }
}
