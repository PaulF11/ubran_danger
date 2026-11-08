// File note: This file handles main.dart.
import 'package:flutter/material.dart';
import 'package:urban_danger/core/app_theme.dart';
import 'package:urban_danger/screens/home/home_screen.dart';
import 'package:urban_danger/screens/incidents/incidents_screen.dart';
import 'package:urban_danger/screens/map/map_screen.dart';
import 'package:urban_danger/screens/profile/profile_screen.dart';
import 'package:urban_danger/widgets/urban_danger_brand_mark.dart';

void main() {
  runApp(const UrbanDangerApp());
}

class UrbanDangerApp extends StatelessWidget {
  const UrbanDangerApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Urban Danger Intelligence',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.monochrome,
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

  late final List<Widget> _screens = [
    HomeScreen(
      onOpenMap: () => _onItemTapped(1),
      onOpenIncidents: () => _onItemTapped(2),
    ),
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
    final isWide = MediaQuery.sizeOf(context).width >= 900;
    return Scaffold(
      appBar: AppBar(
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: const BoxDecoration(
                color: Colors.white,
                shape: BoxShape.rectangle,
              ),
              alignment: Alignment.center,
              child: const UrbanDangerBrandMark(color: Colors.black, size: 29),
            ),
            const SizedBox(width: 10),
            const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'URBAN DANGER',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.05,
                  ),
                ),
                Text(
                  'INTELLIGENCE',
                  style: TextStyle(
                    color: Color(0xFF666666),
                    fontSize: 9,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 1.05,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
      body: isWide
          ? Row(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 12, 8, 12),
                  child: Container(
                    decoration: BoxDecoration(
                      color: Colors.white,
                      border: Border.all(color: Colors.black, width: 0.8),
                      borderRadius: BorderRadius.zero,
                    ),
                    clipBehavior: Clip.antiAlias,
                    child: NavigationRail(
                      leading: const Padding(
                        padding: EdgeInsets.only(top: 14, bottom: 10),
                        child: UrbanDangerBrandMark(
                          color: Colors.black,
                          size: 30,
                        ),
                      ),
                      selectedIndex: _selectedIndex,
                      onDestinationSelected: _onItemTapped,
                      labelType: NavigationRailLabelType.all,
                      destinations: const [
                        NavigationRailDestination(
                          icon: Icon(Icons.grid_view_outlined),
                          selectedIcon: Icon(Icons.grid_view_rounded),
                          label: Text('Home'),
                        ),
                        NavigationRailDestination(
                          icon: Icon(Icons.explore_outlined),
                          selectedIcon: Icon(Icons.explore),
                          label: Text('Map'),
                        ),
                        NavigationRailDestination(
                          icon: Icon(Icons.crisis_alert_outlined),
                          selectedIcon: Icon(Icons.crisis_alert),
                          label: Text('Incidents'),
                        ),
                        NavigationRailDestination(
                          icon: Icon(Icons.person_outline),
                          selectedIcon: Icon(Icons.person),
                          label: Text('Profile'),
                        ),
                      ],
                    ),
                  ),
                ),
                Expanded(child: _screens[_selectedIndex]),
              ],
            )
          : _screens[_selectedIndex],
      bottomNavigationBar: isWide
          ? null
          : SafeArea(
              minimum: const EdgeInsets.fromLTRB(12, 0, 12, 8),
              child: Container(
                decoration: BoxDecoration(
                  color: Colors.white,
                  border: Border.all(color: Colors.black, width: 0.8),
                  borderRadius: BorderRadius.zero,
                ),
                clipBehavior: Clip.antiAlias,
                child: NavigationBar(
                  selectedIndex: _selectedIndex,
                  onDestinationSelected: _onItemTapped,
                  destinations: const [
                    NavigationDestination(
                      icon: Icon(Icons.grid_view_outlined),
                      selectedIcon: Icon(Icons.grid_view_rounded),
                      label: 'Home',
                    ),
                    NavigationDestination(
                      icon: Icon(Icons.explore_outlined),
                      selectedIcon: Icon(Icons.explore),
                      label: 'Map',
                    ),
                    NavigationDestination(
                      icon: Icon(Icons.crisis_alert_outlined),
                      selectedIcon: Icon(Icons.crisis_alert),
                      label: 'Incidents',
                    ),
                    NavigationDestination(
                      icon: Icon(Icons.person_outline),
                      selectedIcon: Icon(Icons.person),
                      label: 'Profile',
                    ),
                  ],
                ),
              ),
            ),
    );
  }
}
