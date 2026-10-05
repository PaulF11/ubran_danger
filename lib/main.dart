import 'package:flutter/material.dart';
import 'package:urban_danger/screens/home/home_screen.dart';
import 'package:urban_danger/screens/incidents/incidents_screen.dart';
import 'package:urban_danger/screens/map/map_screen.dart';
import 'package:urban_danger/screens/profile/profile_screen.dart';

void main() {
  runApp(const UrbanDangerApp());
}

class UrbanDangerApp extends StatelessWidget {
  const UrbanDangerApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Urban Danger',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF1F6FEB)),
        useMaterial3: true,
      ),
      home: const UrbanDangerHomePage(),
    );
  }
}

class UrbanDangerHomePage extends StatefulWidget {
  const UrbanDangerHomePage({super.key});

  @override
  State<UrbanDangerHomePage> createState() => _UrbanDangerHomePageState();
}

class _UrbanDangerHomePageState extends State<UrbanDangerHomePage> {
  int _selectedIndex = 0;

  static const List<Widget> _screens = [
    HomeScreen(),
    MapScreen(),
    IncidentsScreen(),
    ProfileScreen(),
  ];

  void _onItemTapped(int index) {
    setState(() {
      _selectedIndex = index;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Urban Danger'), centerTitle: false),
      body: _screens[_selectedIndex],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _selectedIndex,
        onDestinationSelected: _onItemTapped,
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home),
            label: 'Home',
          ),
          NavigationDestination(
            icon: Icon(Icons.map_outlined),
            selectedIcon: Icon(Icons.map),
            label: 'Map',
          ),
          NavigationDestination(
            icon: Icon(Icons.warning_amber_outlined),
            selectedIcon: Icon(Icons.warning_amber),
            label: 'Incidents',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: 'Profile',
          ),
        ],
      ),
    );
  }
}
