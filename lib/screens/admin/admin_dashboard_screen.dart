import 'package:flutter/material.dart';

import '../../services/admin_auth_service.dart';
import 'admin_login_screen.dart';

class AdminDashboardScreen extends StatefulWidget {
  const AdminDashboardScreen({
    super.key,
    required this.service,
    required this.session,
  });

  final AdminAuthService service;
  final AdminSession session;

  @override
  State<AdminDashboardScreen> createState() => _AdminDashboardScreenState();
}

class _AdminDashboardScreenState extends State<AdminDashboardScreen> {
  AdminDashboardSummary? _summary;
  String? _errorMessage;
  bool _isLoading = true;
  bool _sessionInvalid = false;

  @override
  void initState() {
    super.initState();
    _loadDashboard();
  }

  Future<void> _loadDashboard() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
      _sessionInvalid = false;
    });
    try {
      final summary = await widget.service.fetchDashboard();
      if (mounted) setState(() => _summary = summary);
    } on AdminAuthException catch (error) {
      if (mounted) {
        setState(() {
          _errorMessage = error.message;
          _sessionInvalid = error.sessionInvalid;
        });
      }
    } on Object {
      if (mounted) {
        setState(() {
          _errorMessage = 'The admin dashboard could not be loaded.';
        });
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _signInAgain() async {
    await widget.service.clearSession();
    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute<void>(
        builder: (_) => AdminLoginScreen(service: widget.service),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Admin dashboard'),
        actions: [
          IconButton(
            tooltip: 'Refresh dashboard',
            onPressed: _isLoading ? null : _loadDashboard,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Card(
            child: ListTile(
              leading: Container(
                width: 40,
                height: 40,
                color: Colors.white,
                alignment: Alignment.center,
                child: Icon(
                  Icons.admin_panel_settings_outlined,
                  color: theme.colorScheme.primary,
                ),
              ),
              title: Text(widget.session.email),
              subtitle: const Text('Signed in as ADMIN'),
              trailing: const Icon(Icons.verified_user_outlined),
            ),
          ),
          const SizedBox(height: 16),
          if (_isLoading)
            const Padding(
              padding: EdgeInsets.all(32),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_errorMessage != null)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      _errorMessage!,
                      style: TextStyle(color: theme.colorScheme.error),
                    ),
                    const SizedBox(height: 16),
                    if (_sessionInvalid)
                      OutlinedButton(
                        onPressed: _signInAgain,
                        child: const Text('Sign in again'),
                      )
                    else
                      OutlinedButton(
                        onPressed: _loadDashboard,
                        child: const Text('Try again'),
                      ),
                  ],
                ),
              ),
            )
          else if (_summary != null) ...[
            Text(
              'Verified incident summary',
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 12),
            _StatisticCard(
              label: 'Total verified incidents',
              value: _summary!.totalVerifiedIncidents,
              icon: Icons.fact_check_outlined,
            ),
            const SizedBox(height: 12),
            _StatisticCard(
              label: 'Added in the last 7 days',
              value: _summary!.incidentsAddedRecently,
              icon: Icons.trending_up,
            ),
            const SizedBox(height: 12),
            Text(_summary!.statisticsLabel, style: theme.textTheme.bodySmall),
          ],
        ],
      ),
    );
  }
}

class _StatisticCard extends StatelessWidget {
  const _StatisticCard({
    required this.label,
    required this.value,
    required this.icon,
  });

  final String label;
  final int value;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: ListTile(
        leading: Icon(icon, color: theme.colorScheme.primary),
        title: Text(label),
        subtitle: Text(
          value.toString(),
          style: theme.textTheme.headlineSmall?.copyWith(
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }
}
