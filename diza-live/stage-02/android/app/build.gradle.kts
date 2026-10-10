plugins { id("com.android.application") }

android {
    namespace = "app.diza.live.voice"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.diza.live.voice.prototype"
        minSdk = 26
        targetSdk = 35
        versionCode = 4
        versionName = "0.2.2-stage2-railway"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildTypes {
        getByName("release") { isMinifyEnabled = false }
    }
}
