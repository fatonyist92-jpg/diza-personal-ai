package com.fatoni.diza.actions

import android.content.Context
import android.content.Intent
import android.os.SystemClock
import android.view.accessibility.AccessibilityNodeInfo

object ChatGptBridge {
    private const val PREFS = "diza_chatgpt_bridge"
    private const val KEY_PROMPT = "prompt"
    private const val KEY_RESULT = "result"
    private const val KEY_REQUEST_AT = "request_at"

    fun submit(context: Context, prompt: String): Boolean {
        if (prompt.isBlank() || !DizaAccessibilityService.isEnabled(context)) return false
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(KEY_PROMPT, prompt.trim()).remove(KEY_RESULT)
            .putLong(KEY_REQUEST_AT, SystemClock.elapsedRealtime()).apply()
        val launch = context.packageManager.getLaunchIntentForPackage("com.openai.chatgpt") ?: return false
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(launch)
        return true
    }

    internal fun pendingPrompt(context: Context): String? =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_PROMPT, null)

    internal fun clearPrompt(context: Context) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(KEY_PROMPT).apply()

    internal fun publishResult(context: Context, text: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(KEY_RESULT, text).apply()
    }

    fun consumeResult(context: Context): String? {
        val p=context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val r=p.getString(KEY_RESULT,null)?.takeIf{it.isNotBlank()}
        if(r!=null) p.edit().remove(KEY_RESULT).apply()
        return r
    }

    internal fun setTextAndSend(root: AccessibilityNodeInfo, prompt: String): Boolean {
        val editable=findEditable(root) ?: return false
        val args=android.os.Bundle().apply { putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,prompt) }
        if(!editable.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT,args)) return false
        val send=findByLabels(root,listOf("send","kirim")) ?: return false
        var n: AccessibilityNodeInfo?=send
        while(n!=null && !n.isClickable) n=n.parent
        return n?.performAction(AccessibilityNodeInfo.ACTION_CLICK)==true
    }

    internal fun readLargestText(root: AccessibilityNodeInfo): String {
        val texts=mutableListOf<String>()
        fun walk(n:AccessibilityNodeInfo){
            n.text?.toString()?.trim()?.takeIf{it.length>20}?.let{texts.add(it)}
            for(i in 0 until n.childCount) n.getChild(i)?.let(::walk)
        }
        walk(root)
        return texts.maxByOrNull{it.length}.orEmpty()
    }

    private fun findEditable(n:AccessibilityNodeInfo):AccessibilityNodeInfo? {
        if(n.isEditable) return n
        for(i in 0 until n.childCount) n.getChild(i)?.let{findEditable(it)}?.let{return it}
        return null
    }
    private fun findByLabels(n:AccessibilityNodeInfo, labels:List<String>):AccessibilityNodeInfo? {
        val s=listOfNotNull(n.contentDescription,n.text).joinToString(" ").lowercase()
        if(labels.any{s.contains(it)}) return n
        for(i in 0 until n.childCount) n.getChild(i)?.let{findByLabels(it,labels)}?.let{return it}
        return null
    }
}
