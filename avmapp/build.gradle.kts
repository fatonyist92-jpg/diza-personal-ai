plugins {
    id("com.android.application")
}

android {
    namespace = "com.fatoni.avmtechnical"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.fatoni.avmtechnicalguide"
        minSdk = 26
        targetSdk = 35
        versionCode = 30
        versionName = "2.0.1"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}
