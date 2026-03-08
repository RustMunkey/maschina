package io.maschina.android.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController

@Composable
fun DashboardScreen(navController: NavController) {
    Scaffold(
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = true,
                    onClick = { navController.navigate(Screen.Dashboard.route) },
                    icon = {},
                    label = { Text("Home") },
                )
                NavigationBarItem(
                    selected = false,
                    onClick = { navController.navigate(Screen.Agents.route) },
                    icon = {},
                    label = { Text("Agents") },
                )
                NavigationBarItem(
                    selected = false,
                    onClick = { navController.navigate(Screen.Usage.route) },
                    icon = {},
                    label = { Text("Usage") },
                )
                NavigationBarItem(
                    selected = false,
                    onClick = { navController.navigate(Screen.Settings.route) },
                    icon = {},
                    label = { Text("Settings") },
                )
            }
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(text = "Maschina", style = MaterialTheme.typography.titleLarge)
            Spacer(modifier = Modifier.height(8.dp))
            Text(text = "Your agents are ready.", style = MaterialTheme.typography.bodyLarge)
        }
    }
}
