package io.maschina.wear.presentation

import android.app.Application
import android.content.Context
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import io.maschina.wear.BuildConfig
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray

data class WearAgent(
    val id: String,
    val name: String,
    val status: String,
    val agentType: String,
)

data class WearState(
    val agents: List<WearAgent> = emptyList(),
    val activeRuns: Int = 0,
    val isLoading: Boolean = false,
    val error: String? = null,
)

class WearViewModel(app: Application) : AndroidViewModel(app) {
    private val prefs = app.getSharedPreferences("maschina", Context.MODE_PRIVATE)
    private val client = OkHttpClient()

    private val _state = MutableStateFlow(WearState(isLoading = true))
    val state: StateFlow<WearState> = _state

    init { refresh() }

    fun refresh() {
        viewModelScope.launch {
            _state.value = _state.value.copy(isLoading = true, error = null)
            try {
                val token = prefs.getString("maschina_token", null)
                    ?: run {
                        _state.value = _state.value.copy(isLoading = false, error = "Not logged in")
                        return@launch
                    }

                val req = Request.Builder()
                    .url("${BuildConfig.API_BASE_URL}/agents")
                    .addHeader("Authorization", "Bearer $token")
                    .build()

                val body = client.newCall(req).execute().body?.string() ?: "[]"
                val arr = JSONArray(body)
                val agents = (0 until arr.length()).map { i ->
                    val obj = arr.getJSONObject(i)
                    WearAgent(
                        id = obj.getString("id"),
                        name = obj.getString("name"),
                        status = obj.getString("status"),
                        agentType = obj.getString("agentType"),
                    )
                }
                _state.value = WearState(
                    agents = agents,
                    activeRuns = agents.count { it.status == "running" },
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(isLoading = false, error = e.message)
            }
        }
    }
}
