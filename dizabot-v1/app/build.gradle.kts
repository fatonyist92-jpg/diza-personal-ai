plugins { id("com.android.application") }

android {
    namespace="com.dizabot.app"
    compileSdk=35

    defaultConfig {
        applicationId="com.dizabot.app"
        minSdk=26
        targetSdk=35
        versionCode=100
        versionName="1.0.0"
    }

    buildTypes {
        release { isMinifyEnabled=false }
    }

    compileOptions {
        sourceCompatibility=JavaVersion.VERSION_17
        targetCompatibility=JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.core:core:1.13.1")
    implementation("androidx.work:work-runtime:2.9.1")
}
