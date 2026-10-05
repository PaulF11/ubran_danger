import 'package:flutter/material.dart';

class MapFilters {
  const MapFilters({
    this.category,
    this.severity,
    this.barangay,
    this.dateRange,
  });

  final String? category;
  final String? severity;
  final String? barangay;
  final DateTimeRange? dateRange;

  bool get isActive =>
      category != null ||
      severity != null ||
      barangay != null ||
      dateRange != null;
}

class MapFilterSheet extends StatefulWidget {
  const MapFilterSheet({
    super.key,
    required this.categories,
    required this.barangays,
    required this.initialFilters,
  });

  final List<String> categories;
  final List<String> barangays;
  final MapFilters initialFilters;

  @override
  State<MapFilterSheet> createState() => _MapFilterSheetState();
}

class _MapFilterSheetState extends State<MapFilterSheet> {
  late String? _category = widget.initialFilters.category;
  late String? _severity = widget.initialFilters.severity;
  late String? _barangay = widget.initialFilters.barangay;
  late DateTimeRange? _dateRange = widget.initialFilters.dateRange;

  Future<void> _chooseDateRange() async {
    final now = DateTime.now();
    final selected = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2000),
      lastDate: DateTime(now.year, now.month, now.day),
      initialDateRange: _dateRange,
      helpText: 'Filter incident dates',
    );
    if (selected != null) setState(() => _dateRange = selected);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          18,
          20,
          MediaQuery.viewInsetsOf(context).bottom + 20,
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Map filters',
                      style: theme.textTheme.titleLarge,
                    ),
                  ),
                  IconButton(
                    tooltip: 'Close filters',
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<String?>(
                initialValue: _category,
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: 'Category',
                  prefixIcon: Icon(Icons.category_outlined),
                  border: OutlineInputBorder(),
                ),
                items: [
                  const DropdownMenuItem<String?>(
                    value: null,
                    child: Text('All categories'),
                  ),
                  ...widget.categories.map(
                    (category) => DropdownMenuItem<String?>(
                      value: category,
                      child: Text(category, overflow: TextOverflow.ellipsis),
                    ),
                  ),
                ],
                onChanged: (value) => setState(() => _category = value),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String?>(
                initialValue: _severity,
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: 'Severity',
                  prefixIcon: Icon(Icons.shield_outlined),
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem<String?>(
                    value: null,
                    child: Text('All severities'),
                  ),
                  DropdownMenuItem<String?>(value: 'LOW', child: Text('Low')),
                  DropdownMenuItem<String?>(
                    value: 'MEDIUM',
                    child: Text('Medium'),
                  ),
                  DropdownMenuItem<String?>(value: 'HIGH', child: Text('High')),
                ],
                onChanged: (value) => setState(() => _severity = value),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String?>(
                initialValue: _barangay,
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: 'Barangay',
                  prefixIcon: Icon(Icons.location_on_outlined),
                  border: OutlineInputBorder(),
                ),
                items: [
                  const DropdownMenuItem<String?>(
                    value: null,
                    child: Text('All Taguig barangays'),
                  ),
                  ...widget.barangays.map(
                    (barangay) => DropdownMenuItem<String?>(
                      value: barangay,
                      child: Text(barangay, overflow: TextOverflow.ellipsis),
                    ),
                  ),
                ],
                onChanged: (value) => setState(() => _barangay = value),
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: _chooseDateRange,
                icon: const Icon(Icons.date_range_outlined),
                label: Text(
                  _dateRange == null
                      ? 'Any date'
                      : '${_formatDate(_dateRange!.start)} - ${_formatDate(_dateRange!.end)}',
                ),
              ),
              const SizedBox(height: 18),
              Row(
                children: [
                  TextButton.icon(
                    onPressed: () => Navigator.pop(context, const MapFilters()),
                    icon: const Icon(Icons.filter_alt_off_outlined),
                    label: const Text('Clear'),
                  ),
                  const Spacer(),
                  FilledButton(
                    onPressed: () => Navigator.pop(
                      context,
                      MapFilters(
                        category: _category,
                        severity: _severity,
                        barangay: _barangay,
                        dateRange: _dateRange,
                      ),
                    ),
                    child: const Text('Apply filters'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _formatDate(DateTime date) {
    final local = date.toLocal();
    return '${local.year}-${local.month.toString().padLeft(2, '0')}-${local.day.toString().padLeft(2, '0')}';
  }
}
