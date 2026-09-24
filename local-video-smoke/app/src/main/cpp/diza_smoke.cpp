#include <jni.h>
#include <chrono>
#include <cmath>
#include <fstream>
#include <memory>
#include <sstream>
#include <string>
#include <thread>
#include <vector>
#include <MNN/Interpreter.hpp>
#include <MNN/MNNForwardType.h>
#include <MNN/expr/Executor.hpp>
#include <MNN/expr/ExprCreator.hpp>
#include <MNN/expr/Module.hpp>

using namespace MNN;
using namespace MNN::Express;

static std::string jstr(JNIEnv* env, jstring v) {
    if (!v) return {};
    const char* p = env->GetStringUTFChars(v, nullptr);
    std::string out = p ? p : "";
    if (p) env->ReleaseStringUTFChars(v, p);
    return out;
}

static jstring jout(JNIEnv* env, const std::string& s) {
    return env->NewStringUTF(s.c_str());
}

static bool exists(const std::string& p) {
    std::ifstream f(p, std::ios::binary);
    return f.good();
}

static long statusKb(const char* key) {
    std::ifstream f("/proc/self/status");
    std::string line;
    while (std::getline(f, line)) {
        if (line.rfind(key, 0) == 0) {
            std::istringstream in(line.substr(std::string(key).size()));
            long kb = -1;
            in >> kb;
            return kb;
        }
    }
    return -1;
}

static long long elapsedMs(const std::chrono::steady_clock::time_point& t) {
    return std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::steady_clock::now() - t).count();
}

static double mb(long kb) {
    return kb < 0 ? -1.0 : kb / 1024.0;
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_diza_localvideo_smoke_DizaNative_status(JNIEnv* env, jobject, jstring dir) {
    const std::string d = jstr(env, dir);
    const bool files = exists(d + "/transformer.mnn") && exists(d + "/transformer.mnn.weight");
    std::ostringstream o;
    o << "{\"ok\":true,\"mnnLinked\":true,\"transformerPresent\":" << (files ? "true" : "false");
#ifdef DIZA_HAS_OPENCL
    o << ",\"openclLinked\":true";
#else
    o << ",\"openclLinked\":false";
#endif
#ifdef DIZA_HAS_VULKAN
    o << ",\"vulkanLinked\":true";
#else
    o << ",\"vulkanLinked\":false";
#endif
    o << "}";
    return jout(env, o.str());
}


extern "C" JNIEXPORT jstring JNICALL
Java_com_diza_localvideo_smoke_DizaNative_loadOnly(JNIEnv* env, jobject, jstring dir, jint backend) {
    const std::string d = jstr(env, dir);
    if (!exists(d + "/transformer.mnn") || !exists(d + "/transformer.mnn.weight"))
        return jout(env, "{\"ok\":false,\"stage\":\"model\",\"error\":\"Import exact Release #7 model first\"}");

    if (backend == 1) {
#ifndef DIZA_HAS_OPENCL
        return jout(env, "{\"ok\":false,\"stage\":\"backend\",\"error\":\"OpenCL library absent\"}");
#endif
    }
    if (backend == 2) {
#ifndef DIZA_HAS_VULKAN
        return jout(env, "{\"ok\":false,\"stage\":\"backend\",\"error\":\"Vulkan library absent\"}");
#endif
    }

    const char* backendName = backend == 1 ? "OpenCL" : (backend == 2 ? "Vulkan" : "CPU");
    MNNForwardType type = backend == 1 ? MNN_FORWARD_OPENCL : (backend == 2 ? MNN_FORWARD_VULKAN : MNN_FORWARD_CPU);

    const long rss0 = statusKb("VmRSS:");
    const long hwm0 = statusKb("VmHWM:");
    auto t0 = std::chrono::steady_clock::now();

    {
        ScheduleConfig sc;
        sc.type = type;
        sc.numThread = type == MNN_FORWARD_CPU ? 4 : 1;
        BackendConfig bc;
        bc.precision = BackendConfig::Precision_Normal;
        bc.memory = BackendConfig::Memory_Low;
        sc.backendConfig = &bc;

        std::shared_ptr<Executor::RuntimeManager> runtime(
            Executor::RuntimeManager::createRuntimeManager(sc), Executor::RuntimeManager::destroy);
        if (!runtime) return jout(env, "{\"ok\":false,\"stage\":\"runtime\",\"error\":\"RuntimeManager failed\"}");
        if (backend == 1) runtime->setCache((d + "/opencl.cache").c_str());
        runtime->setExternalFile(d + "/transformer.mnn.weight");

        Module::Config mc;
        mc.shapeMutable = false;
        std::unique_ptr<Module> module(Module::load(
            {"hidden_states", "timestep", "encoder_hidden_states", "encoder_attention_mask"},
            {"noise_pred"}, (d + "/transformer.mnn").c_str(), runtime, &mc));
        if (!module) return jout(env, "{\"ok\":false,\"stage\":\"load\",\"error\":\"Module::load failed\"}");
        module->traceOrOptimize(Interpreter::Session_Resize_Fix);
        module.reset();
        runtime.reset();
    }

    Executor::getGlobalExecutor()->gc(Executor::FULL);
    std::this_thread::sleep_for(std::chrono::milliseconds(250));

    const long rss1 = statusKb("VmRSS:");
    const long hwm1 = statusKb("VmHWM:");
    std::ostringstream o;
    o << "{\"ok\":true,\"stage\":\"load-only\",\"backend\":\"" << backendName << "\""
      << ",\"elapsedMs\":" << elapsedMs(t0)
      << ",\"rssBeforeMb\":" << mb(rss0)
      << ",\"rssAfterUnloadMb\":" << mb(rss1)
      << ",\"hwmBeforeMb\":" << mb(hwm0)
      << ",\"hwmAfterMb\":" << mb(hwm1)
      << "}";
    return jout(env, o.str());
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_diza_localvideo_smoke_DizaNative_smoke(JNIEnv* env, jobject, jstring dir, jint backend) {
    const std::string d = jstr(env, dir);

    if (!exists(d + "/transformer.mnn") || !exists(d + "/transformer.mnn.weight")) {
        return jout(env, "{\"ok\":false,\"stage\":\"model\",\"error\":\"Import exact Release #7 model first\"}");
    }

    if (backend == 1) {
#ifndef DIZA_HAS_OPENCL
        return jout(env, "{\"ok\":false,\"stage\":\"backend\",\"error\":\"OpenCL library absent\"}");
#endif
    }

    if (backend == 2) {
#ifndef DIZA_HAS_VULKAN
        return jout(env, "{\"ok\":false,\"stage\":\"backend\",\"error\":\"Vulkan library absent\"}");
#endif
    }

    const char* backendName = backend == 1 ? "OpenCL" : (backend == 2 ? "Vulkan" : "CPU");
    MNNForwardType type = backend == 1
        ? MNN_FORWARD_OPENCL
        : (backend == 2 ? MNN_FORWARD_VULKAN : MNN_FORWARD_CPU);

    const long rss0 = statusKb("VmRSS:");
    const long hwm0 = statusKb("VmHWM:");

    long rss1 = -1, hwm1 = -1;
    long rss2 = -1, hwm2 = -1;
    long rss3 = -1, hwm3 = -1;
    long long loadMs = -1;
    long long forwardMs = -1;
    long long unloadGcMs = -1;
    int elements = 0;
    int bad = 0;
    double mean = 0.0;
    double rms = 0.0;
    std::vector<int> shape;

    {
        ScheduleConfig sc;
        sc.type = type;
        sc.numThread = type == MNN_FORWARD_CPU ? 4 : 1;

        BackendConfig bc;
        bc.precision = BackendConfig::Precision_Normal;
        bc.memory = BackendConfig::Memory_Low;
        sc.backendConfig = &bc;

        auto t0 = std::chrono::steady_clock::now();
        std::shared_ptr<Executor::RuntimeManager> runtime(
            Executor::RuntimeManager::createRuntimeManager(sc),
            Executor::RuntimeManager::destroy);

        if (!runtime) {
            return jout(env, "{\"ok\":false,\"stage\":\"runtime\",\"error\":\"RuntimeManager failed\"}");
        }

        if (backend == 1) {
            runtime->setCache((d + "/opencl.cache").c_str());
        }
        runtime->setExternalFile(d + "/transformer.mnn.weight");

        Module::Config mc;
        mc.shapeMutable = false;
        std::unique_ptr<Module> module(Module::load(
            {"hidden_states", "timestep", "encoder_hidden_states", "encoder_attention_mask"},
            {"noise_pred"},
            (d + "/transformer.mnn").c_str(),
            runtime,
            &mc));

        if (!module) {
            return jout(env, "{\"ok\":false,\"stage\":\"load\",\"error\":\"Module::load failed\"}");
        }

        module->traceOrOptimize(Interpreter::Session_Resize_Fix);
        loadMs = elapsedMs(t0);
        rss1 = statusKb("VmRSS:");
        hwm1 = statusKb("VmHWM:");

        auto hidden = _Input({1, 16, 4, 32, 32}, NCHW, halide_type_of<float>());
        auto timestep = _Input({1}, NCHW, halide_type_of<float>());
        auto text = _Input({1, 512, 4096}, NCHW, halide_type_of<float>());
        auto mask = _Input({1, 512}, NCHW, halide_type_of<int>());

        float* hp = hidden->writeMap<float>();
        float* tp = timestep->writeMap<float>();
        float* xp = text->writeMap<float>();
        int* mp = mask->writeMap<int>();

        for (int i = 0; i < 1 * 16 * 4 * 32 * 32; ++i) {
            hp[i] = std::sin(i * .001f);
        }
        tp[0] = 500.f;
        for (int i = 0; i < 1 * 512 * 4096; ++i) {
            xp[i] = std::cos(i * .0001f) * .02f;
        }
        for (int i = 0; i < 512; ++i) {
            mp[i] = 1;
        }

        auto tf = std::chrono::steady_clock::now();
        auto outputs = module->onForward({hidden, timestep, text, mask});

        if (outputs.empty() || outputs[0].get() == nullptr) {
            return jout(env, "{\"ok\":false,\"stage\":\"forward\",\"error\":\"empty output\"}");
        }

        auto out = _Convert(outputs[0], NCHW);
        out.fix(VARP::CONSTANT);
        forwardMs = elapsedMs(tf);

        auto info = out->getInfo();
        const float* values = out->readMap<float>();

        if (!info || !values) {
            return jout(env, "{\"ok\":false,\"stage\":\"forward\",\"error\":\"output map failed\"}");
        }

        double sum = 0.0;
        double sq = 0.0;
        elements = info->size;
        shape = info->dim;

        for (int i = 0; i < info->size; ++i) {
            const float v = values[i];
            if (!std::isfinite(v)) ++bad;
            sum += v;
            sq += double(v) * double(v);
        }

        mean = elements ? sum / elements : 0.0;
        rms = elements ? std::sqrt(sq / elements) : 0.0;
        rss2 = statusKb("VmRSS:");
        hwm2 = statusKb("VmHWM:");

        if (backend == 1) {
            runtime->updateCache();
        }

        module.reset();
        runtime.reset();
    }

    auto tg = std::chrono::steady_clock::now();
    Executor::getGlobalExecutor()->gc(Executor::FULL);
    std::this_thread::sleep_for(std::chrono::milliseconds(250));
    unloadGcMs = elapsedMs(tg);

    rss3 = statusKb("VmRSS:");
    hwm3 = statusKb("VmHWM:");

    std::ostringstream o;
    o << "{\"ok\":" << (bad == 0 ? "true" : "false")
      << ",\"stage\":\"proof-of-life\""
      << ",\"backend\":\"" << backendName << "\""
      << ",\"loadMs\":" << loadMs
      << ",\"forwardMs\":" << forwardMs
      << ",\"unloadGcMs\":" << unloadGcMs
      << ",\"rssBeforeMb\":" << mb(rss0)
      << ",\"rssAfterLoadMb\":" << mb(rss1)
      << ",\"rssAfterForwardMb\":" << mb(rss2)
      << ",\"rssAfterUnloadMb\":" << mb(rss3)
      << ",\"rssReclaimedMb\":"
      << ((rss2 >= 0 && rss3 >= 0) ? (rss2 - rss3) / 1024.0 : -1.0)
      << ",\"hwmBeforeMb\":" << mb(hwm0)
      << ",\"hwmAfterLoadMb\":" << mb(hwm1)
      << ",\"hwmAfterForwardMb\":" << mb(hwm2)
      << ",\"hwmAfterUnloadMb\":" << mb(hwm3)
      << ",\"elements\":" << elements
      << ",\"mean\":" << mean
      << ",\"rms\":" << rms
      << ",\"nonFinite\":" << bad
      << ",\"shape\":[";

    for (size_t i = 0; i < shape.size(); ++i) {
        if (i) o << ',';
        o << shape[i];
    }

    o << "]}";
    return jout(env, o.str());
}
