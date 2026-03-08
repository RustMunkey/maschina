package io.maschina.wear.presentation

import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.material.*

@Composable
fun WearApp(state: WearState, onRefresh: () -> Unit) {
    when {
        state.isLoading -> LoadingScreen()
        state.error != null -> ErrorScreen(state.error, onRefresh)
        else -> AgentListScreen(state, onRefresh)
    }
}

@Composable
private fun LoadingScreen() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator()
    }
}

@Composable
private fun ErrorScreen(error: String, onRetry: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(error, style = MaterialTheme.typography.body2, textAlign = TextAlign.Center)
        Spacer(Modifier.height(8.dp))
        Chip(onClick = onRetry, label = { Text("Retry") })
    }
}

@Composable
private fun AgentListScreen(state: WearState, onRefresh: () -> Unit) {
    ScalingLazyColumn(modifier = Modifier.fillMaxSize()) {
        item {
            ListHeader {
                Text("${state.activeRuns} active · ${state.agents.size} total")
            }
        }
        items(state.agents) { agent ->
            AgentChip(agent)
        }
        item {
            CompactChip(onClick = onRefresh, label = { Text("Refresh") })
        }
    }
}

@Composable
private fun AgentChip(agent: WearAgent) {
    Chip(
        modifier = Modifier.fillMaxWidth(),
        onClick = {},
        label = { Text(agent.name, maxLines = 1) },
        secondaryLabel = { Text(agent.status) },
        colors = ChipDefaults.chipColors(
            contentColor = when (agent.status) {
                "running" -> MaterialTheme.colors.primary
                "error"   -> MaterialTheme.colors.error
                else      -> MaterialTheme.colors.onSurface
            }
        ),
    )
}
