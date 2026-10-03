plugins {
    id("com.android.application")
}

android {
    namespace = "com.diza.personalassistant"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.diza.personalassistant"
        minSdk = 26
        targetSdk = 35
        versionCode = 6
        versionName = "0.5.1"
        buildConfigField("String", "DIZA_SERVER_URL", "\"https://example.invalid\"")
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
        }
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
        }
    }
}


dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
}
