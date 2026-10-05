import 'package:flutter/material.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 22, 20, 32),
      children: [
        Text(
          'Urban Danger Intelligence System',
          style: theme.textTheme.headlineSmall?.copyWith(
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 12),
        Text(
          'This public application presents verified, Taguig-scoped incident information derived from trusted automated source processing and validation rules.',
          style: theme.textTheme.bodyLarge,
        ),
        const SizedBox(height: 18),
        _InfoCard(
          title: 'Coverage area',
          body: 'Taguig City, Philippines',
          icon: Icons.location_city_outlined,
        ),
        const SizedBox(height: 12),
        _InfoCard(
          title: 'Verification model',
          body:
              'Only records that pass trusted-source validation, geographic checks, deduplication, and verification rules are published.',
          icon: Icons.fact_check_outlined,
        ),
        const SizedBox(height: 12),
        _InfoCard(
          title: 'Data limitations',
          body:
              'Historical incident records are informational and do not guarantee personal safety or predict future events.',
          icon: Icons.warning_amber_outlined,
        ),
        const SizedBox(height: 12),
        _InfoCard(
          title: 'Application purpose',
          body:
              'Map viewing, incidents, analytics, and route-related historical context for public awareness.',
          icon: Icons.info_outline,
        ),
      ],
    );
  }
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({
    required this.title,
    required this.body,
    required this.icon,
  });

  final String title;
  final String body;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: theme.colorScheme.primary),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: theme.textTheme.titleMedium),
                  const SizedBox(height: 4),
                  Text(body, style: theme.textTheme.bodyMedium),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
