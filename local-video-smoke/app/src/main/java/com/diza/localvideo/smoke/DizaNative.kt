package com.diza.localvideo.smoke

object DizaNative {
    init { System.loadLibrary("diza_smoke") }
    external fun status(modelDir: String): String
    external fun smoke(modelDir: String, backend: Int): String
}
