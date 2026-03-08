package io.maschina.wear.presentation

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.viewmodel.compose.viewModel
import io.maschina.wear.presentation.theme.MaschinaWearTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaschinaWearTheme {
                val vm: WearViewModel = viewModel()
                val state by vm.state.collectAsState()
                WearApp(state = state, onRefresh = vm::refresh)
            }
        }
    }
}
