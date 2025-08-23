from django.contrib import admin
from django import forms
from django.urls import path
from django.shortcuts import render, redirect
from django.contrib import messages
from django.http import HttpResponse, HttpResponseRedirect
from django.core.management import call_command
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
import tempfile
import os
import io
from import_export.admin import ImportExportModelAdmin
from import_export import resources
from .models import (
    Organization, OrganizationUser, StrategicObjective, 
    Program, StrategicInitiative, PerformanceMeasure, MainActivity,
    ActivityBudget, ActivityCostingAssumption, InitiativeFeed,
    Location, LandTransport, AirTransport, PerDiem, Accommodation,
    ParticipantCost, SessionCost, PrintingCost, SupervisorCost,ProcurementItem,Plan,SubActivity
)
from .bulk_import import BulkSubActivityImporter
admin.site.register(Plan)
class OrganizationAdminForm(forms.ModelForm):
    core_values_text = forms.CharField(
        widget=forms.Textarea(attrs={'rows': 5}),
        required=False,
        label="Core Values (one per line)",
        help_text="Enter each core value on a new line"
    )

    class Meta:
        model = Organization
        fields = '__all__'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Convert JSON list to newline-separated text for editing
        if self.instance.pk and self.instance.core_values:
            self.fields['core_values_text'].initial = '\n'.join(self.instance.core_values)

    def clean(self):
        cleaned_data = super().clean()
        # Convert newline-separated text back to list for JSON field
        core_values_text = cleaned_data.get('core_values_text', '')
        if core_values_text:
            cleaned_data['core_values'] = [value.strip() for value in core_values_text.split('\n') if value.strip()]
        else:
            cleaned_data['core_values'] = []
        return cleaned_data

@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    form = OrganizationAdminForm
    list_display = ('name', 'type', 'parent', 'created_at', 'updated_at')
    list_filter = ('type',)
    search_fields = ('name',)
    ordering = ('type', 'name')
    fieldsets = (
        (None, {
            'fields': ('name', 'type', 'parent')
        }),
        ('Metadata', {
            'fields': ('vision', 'mission', 'core_values_text'),
            'classes': ('collapse',),
        }),
    )

    def save_model(self, request, obj, form, change):
        # Core values are already processed in the form's clean method
        super().save_model(request, obj, form, change)

@admin.register(OrganizationUser)
class OrganizationUserAdmin(admin.ModelAdmin):
    list_display = ('user', 'organization', 'role', 'created_at')
    list_filter = ('role', 'organization')
    search_fields = ('user__username', 'user__email', 'organization__name')
    ordering = ('organization', 'user')

@admin.register(InitiativeFeed)
class InitiativeFeedAdmin(admin.ModelAdmin):
    list_display = ('name', 'strategic_objective', 'is_active', 'created_at', 'updated_at')
    search_fields = ('name', 'description', 'strategic_objective__title')
    list_filter = ('is_active', 'strategic_objective')
    ordering = ('name',)
    fieldsets = (
        (None, {
            'fields': ('name', 'description', 'strategic_objective', 'is_active')
        }),
    )

@admin.register(StrategicObjective)
class StrategicObjectiveAdmin(admin.ModelAdmin):
    list_display = ('title', 'weight', 'is_default', 'created_at', 'updated_at')
    list_filter = ('is_default',)
    search_fields = ('title', 'description')

@admin.register(Program)
class ProgramAdmin(admin.ModelAdmin):
    list_display = ('name', 'strategic_objective', 'is_default', 'created_at', 'updated_at')
    list_filter = ('strategic_objective', 'is_default')
    search_fields = ('name', 'description')

class PerformanceMeasureInline(admin.TabularInline):
    model = PerformanceMeasure
    extra = 1
    fields = ('name', 'weight', 'baseline', 'q1_target', 'q2_target', 'q3_target', 'q4_target', 'annual_target')

class MainActivityInline(admin.TabularInline):
    model = MainActivity
    extra = 1
    fields = ('name', 'weight', 'selected_months', 'selected_quarters', 'baseline', 'target_type', 'q1_target', 'q2_target', 'q3_target', 'q4_target', 'annual_target')

@admin.register(StrategicInitiative)
class StrategicInitiativeAdmin(admin.ModelAdmin):
    list_display = ('name', 'strategic_objective', 'program', 'weight', 'is_default', 'created_at', 'updated_at')
    list_filter = ('strategic_objective', 'program', 'is_default')
    search_fields = ('name',)
    inlines = [PerformanceMeasureInline, MainActivityInline]

@admin.register(PerformanceMeasure)
class PerformanceMeasureAdmin(admin.ModelAdmin):
    list_display = ('name', 'initiative', 'weight', 'annual_target', 'created_at', 'updated_at')
    list_filter = ('initiative',)
    search_fields = ('name',)
    fieldsets = (
        (None, {
            'fields': ('initiative', 'name', 'weight', 'baseline')
        }),
        ('Targets', {
            'fields': ('target_type', 'q1_target', 'q2_target', 'q3_target', 'q4_target', 'annual_target'),
        }),
        ('Period', {
            'fields': ('selected_months', 'selected_quarters'),
            'classes': ('collapse',),
        }),
    )

@admin.register(MainActivity)
class MainActivityAdmin(admin.ModelAdmin):
    list_display = ('name', 'initiative', 'weight', 'created_at', 'updated_at')
    list_filter = ('initiative',)
    search_fields = ('name',)
    fieldsets = (
        (None, {
            'fields': ('initiative', 'name', 'weight')
        }),
        ('Period', {
            'fields': ('selected_months', 'selected_quarters'),
        }),
        ('Targets', {
            'fields': ('baseline', 'target_type', 'q1_target', 'q2_target', 'q3_target', 'q4_target', 'annual_target'),
        }),
    )

@admin.register(ActivityBudget)
class ActivityBudgetAdmin(admin.ModelAdmin):
    list_display = ('get_activity_name', 'budget_calculation_type', 'activity_type', 'get_estimated_cost', 'created_at')
    list_filter = ('budget_calculation_type', 'activity_type')
    search_fields = ('sub_activity__name', 'activity__name')
    fieldsets = (
        (None, {
            'fields': ('sub_activity', 'activity', 'budget_calculation_type', 'activity_type')
        }),
        ('Costs', {
            'fields': (
                'estimated_cost_with_tool',
                'estimated_cost_without_tool',
                'government_treasury',
                'sdg_funding',
                'partners_funding',
                'other_funding'
            ),
        }),
        ('Activity Details', {
            'fields': (
                'training_details',
                'meeting_workshop_details',
                'procurement_details',
                'printing_details',
                'supervision_details',
                'partners_details'
            ),
            'classes': ('collapse',),
        }),
    )
    
    def get_activity_name(self, obj):
        """Get the activity name from either sub_activity or legacy activity"""
        if obj.sub_activity:
            return f"Sub-Activity: {obj.sub_activity.name}"
        elif obj.activity:
            return f"Main Activity: {obj.activity.name}"
        else:
            return "No Activity Assigned"
    get_activity_name.short_description = 'Activity'
    get_activity_name.admin_order_field = 'sub_activity__name'
    
    def get_estimated_cost(self, obj):
        """Get the effective estimated cost based on calculation type"""
        if obj.budget_calculation_type == 'WITH_TOOL':
            return f"ETB {obj.estimated_cost_with_tool:,.2f}"
        else:
            return f"ETB {obj.estimated_cost_without_tool:,.2f}"
    get_estimated_cost.short_description = 'Estimated Cost'
    
    def get_queryset(self, request):
        """Optimize queryset to prevent N+1 queries"""
        return super().get_queryset(request).select_related(
            'sub_activity', 
            'activity',
            'sub_activity__main_activity',
            'activity__initiative'
        )
    
    def has_view_permission(self, request, obj=None):
        return True
    
    def has_change_permission(self, request, obj=None):
        return True
    
    def has_delete_permission(self, request, obj=None):
        return True
    
    def has_add_permission(self, request):
        return True

@admin.register(ActivityCostingAssumption)
class ActivityCostingAssumptionAdmin(admin.ModelAdmin):
    list_display = ('activity_type', 'location', 'cost_type', 'amount', 'created_at')
    list_filter = ('activity_type', 'location', 'cost_type')
    search_fields = ('description',)
    ordering = ('activity_type', 'location', 'cost_type')

# New models registration
@admin.register(Location)
class LocationAdmin(admin.ModelAdmin):
    list_display = ('name', 'region', 'is_hardship_area')
    list_filter = ('is_hardship_area', 'region')
    search_fields = ('name', 'region')
    ordering = ('region', 'name')
    fieldsets = (
        (None, {
            'fields': ('name', 'region', 'is_hardship_area')
        }),
    )
    
    def formfield_for_choice_field(self, db_field, request, **kwargs):
        if db_field.name == 'region':
            kwargs['choices'] = Location.REGIONS
        return super().formfield_for_choice_field(db_field, request, **kwargs)

@admin.register(LandTransport)
class LandTransportAdmin(admin.ModelAdmin):
    list_display = ('origin', 'destination', 'trip_type', 'price')
    list_filter = ('trip_type', 'origin__region', 'destination__region')
    search_fields = ('origin__name', 'destination__name')
    ordering = ('origin', 'destination')

@admin.register(AirTransport)
class AirTransportAdmin(admin.ModelAdmin):
    list_display = ('origin', 'destination', 'price')
    list_filter = ('origin__region', 'destination__region')
    search_fields = ('origin__name', 'destination__name')
    ordering = ('origin', 'destination')

@admin.register(PerDiem)
class PerDiemAdmin(admin.ModelAdmin):
    list_display = ('location', 'amount', 'hardship_allowance_amount')
    list_filter = ('location__region',)
    search_fields = ('location__name',)
    ordering = ('location', 'amount')

@admin.register(Accommodation)
class AccommodationAdmin(admin.ModelAdmin):
    list_display = ('location', 'service_type', 'price')
    list_filter = ('service_type', 'location__region')
    search_fields = ('location__name',)
    ordering = ('location', 'service_type')

@admin.register(ParticipantCost)
class ParticipantCostAdmin(admin.ModelAdmin):
    list_display = ('cost_type', 'price')
    list_filter = ('cost_type',)
    ordering = ('cost_type',)

@admin.register(SessionCost)
class SessionCostAdmin(admin.ModelAdmin):
    list_display = ('cost_type', 'price')
    list_filter = ('cost_type',)
    ordering = ('cost_type',)

@admin.register(PrintingCost)
class PrintingCostAdmin(admin.ModelAdmin):
    list_display = ('document_type', 'price_per_page')
    list_filter = ('document_type',)
    ordering = ('document_type',)

@admin.register(SupervisorCost)
class SupervisorCostAdmin(admin.ModelAdmin):
    list_display = ('cost_type', 'amount')
    list_filter = ('cost_type',)
    ordering = ('cost_type',)
class ProcurementItemResource(resources.ModelResource):
    class Meta:
        model = ProcurementItem
        fields = ('id', 'category', 'name', 'unit', 'unit_price', 'created_at', 'updated_at')
        import_id_fields = ('category', 'name', 'unit')  # prevent duplicates


@admin.register(ProcurementItem)
class ProcurementItemAdmin(ImportExportModelAdmin):
    resource_class = ProcurementItemResource
    list_display = ("category", "name", "unit", "unit_price", "created_at")
    search_fields = ("name", "category")
    list_filter = ("category", "unit")
class SubActivityAdmin(admin.ModelAdmin):
    list_display = ('name', 'main_activity', 'activity_type', 'get_estimated_cost', 'get_total_funding', 'get_funding_gap')
    list_filter = ('main_activity', 'activity_type')
    search_fields = ('name',)
    ordering = ('main_activity', 'name')
    actions = ['bulk_import_action']
    
    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path('bulk-import/', self.admin_site.admin_view(self.bulk_import_view), name='subactivity_bulk_import'),
            path('download-template/', self.admin_site.admin_view(self.download_template_view), name='subactivity_download_template'),
        ]
        return custom_urls + urls
    
    def bulk_import_action(self, request, queryset):
        """Admin action for bulk import (redirects to bulk import page)"""
        return redirect('admin:subactivity_bulk_import')
    bulk_import_action.short_description = "Bulk import sub-activities from CSV/Excel"
    
    def bulk_import_view(self, request):
        """Admin view for bulk importing sub-activities"""
        if request.method == 'POST':
            try:
                # Debug: Print all POST data and files
                print("POST data:", request.POST)
                print("FILES data:", request.FILES)
                
                # Handle file upload - check for different possible field names
                uploaded_file = None
                if 'csv_file' in request.FILES:
                    uploaded_file = request.FILES['csv_file']
                elif 'file' in request.FILES:
                    uploaded_file = request.FILES['file']
                elif 'upload_file' in request.FILES:
                    uploaded_file = request.FILES['upload_file']
                
                if not uploaded_file:
                    messages.error(request, 'Please select a file to upload.')
                    return render(request, 'admin/bulk_import_subactivities.html', {
                        'title': 'Bulk Import Sub-Activities',
                        'organizations': Organization.objects.all().order_by('name'),
                        'opts': self.model._meta,
                        'has_change_permission': self.has_change_permission(request),
                        'app_label': self.model._meta.app_label,
                    })

                organization_id = request.POST.get('organization_id')
                if organization_id and organization_id.strip() == '':
                    organization_id = None
                    
                dry_run = 'dry_run' in request.POST
                
                # Validate file type
                if not uploaded_file.name.endswith(('.csv', '.xlsx', '.xls')):
                    messages.error(request, 'Please upload a CSV or Excel file.')
                    return render(request, 'admin/bulk_import_subactivities.html', {
                        'title': 'Bulk Import Sub-Activities',
                        'organizations': Organization.objects.all().order_by('name'),
                        'opts': self.model._meta,
                        'has_change_permission': self.has_change_permission(request),
                        'app_label': self.model._meta.app_label,
                    })
                
                # Save file temporarily
                file_content = uploaded_file.read()
                
                with tempfile.NamedTemporaryFile(delete=False, suffix=f'.{uploaded_file.name.split(".")[-1]}') as temp_file:
                    temp_file.write(file_content)
                    temp_file_path = temp_file.name

                try:
                    # Use the BulkSubActivityImporter directly
                    importer = BulkSubActivityImporter(default_organization_id=organization_id)
                    
                    if dry_run:
                        # Dry run preview
                        result = importer.import_from_file(temp_file_path, dry_run=True)
                        
                        # Format the preview message
                        preview_msg = f"DRY RUN PREVIEW: {result} sub-activities ready for import"
                        if importer.errors:
                            preview_msg += f"\n\nERRORS ({len(importer.errors)}):\n" + "\n".join(importer.errors[:5])
                            if len(importer.errors) > 5:
                                preview_msg += f"\n... and {len(importer.errors) - 5} more errors"
                        if importer.warnings:
                            preview_msg += f"\n\nWARNINGS ({len(importer.warnings)}):\n" + "\n".join(importer.warnings[:5])
                            if len(importer.warnings) > 5:
                                preview_msg += f"\n... and {len(importer.warnings) - 5} more warnings"
                        
                        if result > 0:
                            messages.success(request, preview_msg)
                        else:
                            messages.error(request, f"DRY RUN FAILED: No valid sub-activities found.\n\n{preview_msg}")
                    else:
                        # Actual import
                        result = importer.import_from_file(temp_file_path, dry_run=False)
                        
                        if result > 0:
                            success_msg = f"IMPORT COMPLETED: {result} sub-activities successfully imported!"
                            if organization_id:
                                try:
                                    org = Organization.objects.get(id=organization_id)
                                    success_msg += f"\nAll imported to organization: {org.name}"
                                except Organization.DoesNotExist:
                                    pass
                            messages.success(request, success_msg)
                        else:
                            error_msg = "IMPORT FAILED: No sub-activities were imported."
                            if importer.errors:
                                error_msg += f"\n\nERRORS:\n" + "\n".join(importer.errors[:10])
                            messages.error(request, error_msg)
                
                except Exception as e:
                    messages.error(request, f'Import failed: {str(e)}')
                finally:
                    # Clean up temp file
                    try:
                        os.unlink(temp_file_path)
                    except OSError:
                        pass
                
            except Exception as e:
                print(f"Bulk import error: {e}")
                messages.error(request, f'Import failed: {str(e)}')
            
            # Redirect back to main list after processing
            return redirect('../../')
                
        # GET request - show upload form
        # Get organizations for dropdown
        organizations = Organization.objects.all().order_by('name')
        
        # Debug: Print organizations
        print(f"Organizations for dropdown: {[org.name for org in organizations]}")
        
        context = {
            'title': 'Bulk Import Sub-Activities',
            'organizations': organizations,
            'opts': self.model._meta,
            'has_change_permission': self.has_change_permission(request),
            'app_label': self.model._meta.app_label,
            'preserved': {},  # Add this to match Django admin template expectations
        }
        
        return render(request, 'admin/bulk_import_subactivities.html', context)
    
    def download_template_view(self, request):
        """Download CSV template for bulk import"""
        try:
            # Create sample template data
            template_data = [
                'main_activity_name,name,activity_type,description,budget_calculation_type,estimated_cost_with_tool,estimated_cost_without_tool,government_treasury,sdg_funding,partners_funding,other_funding,organization_id,training_details,meeting_workshop_details,procurement_details,printing_details,supervision_details,partners_details',
                '"Health System Strengthening","Training on Health Management",Training,"Capacity building training for health workers",WITH_TOOL,50000,0,30000,10000,5000,5000,1,"{}","{}","{}","{}","{}","{}"',
                '"Quality Assurance","Regional Health Meeting",Meeting,"Quarterly review meeting with regional offices",WITHOUT_TOOL,0,30000,20000,5000,3000,2000,1,"{}","{}","{}","{}","{}","{}"',
                '"Infrastructure Development","Medical Equipment Procurement",Procurement,"Procurement of essential medical equipment",WITH_TOOL,200000,0,150000,50000,0,0,2,"{}","{}","{}","{}","{}","{}"'
            ]
            
            csv_content = '\n'.join(template_data)
            
            response = HttpResponse(csv_content, content_type='text/csv')
            response['Content-Disposition'] = 'attachment; filename="subactivity_import_template.csv"'
            
            return response
            
        except Exception as e:
            messages.error(request, f'Failed to generate template: {str(e)}')
            return redirect('..')
    
    def changelist_view(self, request, extra_context=None):
        """Add bulk import button to changelist"""
        extra_context = extra_context or {}
        extra_context['bulk_import_url'] = 'bulk-import/'
        extra_context['template_download_url'] = 'download-template/'
        return super().changelist_view(request, extra_context=extra_context)
    
    def get_estimated_cost(self, obj):
        """Get the effective estimated cost"""
        return f"ETB {obj.estimated_cost:,.2f}"
    get_estimated_cost.short_description = 'Estimated Cost'
    
    def get_total_funding(self, obj):
        """Get total funding"""
        return f"ETB {obj.total_funding:,.2f}"
    get_total_funding.short_description = 'Total Funding'
    
    def get_funding_gap(self, obj):
        """Get funding gap"""
        gap = obj.funding_gap
        color = 'red' if gap > 0 else 'green'
        return f'<span style="color: {color};">ETB {gap:,.2f}</span>'
    get_funding_gap.short_description = 'Funding Gap'
    get_funding_gap.allow_tags = True
    
    fieldsets = (
        (None, {
            'fields': ('main_activity', 'name', 'activity_type', 'description')
        }),
        ('Budget Information', {
            'fields': (
                'budget_calculation_type',
                'estimated_cost_with_tool',
                'estimated_cost_without_tool',
                'government_treasury',
                'sdg_funding',
                'partners_funding',
                'other_funding'
            ),
        }),
        ('Activity Details', {
            'fields': (
                'training_details',
                'meeting_workshop_details',
                'procurement_details',
                'printing_details',
                'supervision_details',
                'partners_details'
            ),
            'classes': ('collapse',),
        }),
    )
# Register the SubActivity admin
admin.site.register(SubActivity, SubActivityAdmin)