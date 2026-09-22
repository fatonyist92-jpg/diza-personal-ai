plugins {
    id("com.android.application")
}

android {
    namespace = "com.fatoni.avmtechnical"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.fatoni.avmtechnical"
        minSdk = 26
        targetSdk = 35
        versionCode = 2
        versionName = "2.0.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}
