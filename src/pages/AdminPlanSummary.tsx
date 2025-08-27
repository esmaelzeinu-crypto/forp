import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FileSpreadsheet, Download, Building2, User, Calendar, FileType, Target, Activity, DollarSign, AlertCircle, Info, Loader, CheckCircle } from 'lucide-react';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { plans, auth, api } from '../lib/api';
import { format } from 'date-fns';
import PlanReviewTable from '../components/PlanReviewTable';
import { exportToExcel, exportToPDF } from '../lib/utils/export';

const AdminPlanSummary: React.FC = () => {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [error, setError] = useState<string | null>(null);

  // Fetch plan details with complete data for admin viewing
  const { data: planData, isLoading, error: planError } = useQuery({
    queryKey: ['admin-plan', planId],
    queryFn: async () => {
      if (!planId) throw new Error('Plan ID is required');
      
      try {
        console.log('AdminPlanSummary: Fetching plan details for ID:', planId);
        
        // Fetch the plan
        const planResponse = await api.get(`/plans/${planId}/`);
        console.log('AdminPlanSummary: Plan data received:', planResponse.data);
        
        if (!planResponse.data) {
          throw new Error('Plan data not found');
        }
        
        const plan = planResponse.data;
        
        // ADMIN FIX: Fetch complete objectives data without organization restrictions
        if (plan.selected_objectives && Array.isArray(plan.selected_objectives)) {
          console.log('AdminPlanSummary: Fetching complete objectives for plan organization:', plan.organization);
          
          try {
            // Fetch each selected objective with complete data
            const enrichedObjectives = await Promise.all(
              plan.selected_objectives.map(async (objId: number) => {
                console.log(`AdminPlanSummary: Fetching objective ${objId}`);
                
                // Get objective basic data
                const objResponse = await api.get(`/strategic-objectives/${objId}/`);
                const objective = objResponse.data;
                
                if (!objective) return null;
                
                console.log(`AdminPlanSummary: Processing objective "${objective.title}" with ${objective.initiatives?.length || 0} initiatives`);
                
                // Get all initiatives for this objective (no filtering)
                const initiativesResponse = await api.get('/strategic-initiatives/', {
                  params: { strategic_objective: objId }
                });
                const allInitiatives = initiativesResponse.data?.results || initiativesResponse.data || [];
                
                console.log(`AdminPlanSummary: Found ${allInitiatives.length} total initiatives for objective ${objId}`);
                
                // Process each initiative with complete data
                const processedInitiatives = await Promise.all(
                  allInitiatives.map(async (initiative: any) => {
                    console.log(`AdminPlanSummary: Processing initiative "${initiative.name}" (ID: ${initiative.id})`);
                    
                    // Get performance measures for this initiative (no org filtering)
                    const measuresResponse = await api.get('/performance-measures/', {
                      params: { initiative: initiative.id }
                    });
                    const measures = measuresResponse.data?.results || measuresResponse.data || [];
                    
                    // Get main activities for this initiative (no org filtering)  
                    const activitiesResponse = await api.get('/main-activities/', {
                      params: { initiative: initiative.id }
                    });
                    const activities = activitiesResponse.data?.results || activitiesResponse.data || [];
                    
                    console.log(`AdminPlanSummary: Initiative "${initiative.name}": ${measures.length} measures, ${activities.length} activities`);
                    
                    // Get sub-activities for each main activity
                    const enrichedActivities = await Promise.all(
                      activities.map(async (activity: any) => {
                        try {
                          const subActivitiesResponse = await api.get('/sub-activities/', {
                            params: { main_activity: activity.id }
                          });
                          const subActivities = subActivitiesResponse.data?.results || subActivitiesResponse.data || [];
                          
                          console.log(`AdminPlanSummary: Activity "${activity.name}": ${subActivities.length} sub-activities`);
                          
                          return {
                            ...activity,
                            sub_activities: subActivities
                          };
                        } catch (error) {
                          console.error(`AdminPlanSummary: Error fetching sub-activities for activity ${activity.id}:`, error);
                          return {
                            ...activity,
                            sub_activities: []
                          };
                        }
                      })
                    );
                    
                    return {
                      ...initiative,
                      performance_measures: measures,
                      main_activities: enrichedActivities
                    };
                  })
                );
                
                console.log(`AdminPlanSummary: Objective "${objective.title}" final data: ${processedInitiatives.length} initiatives processed`);
                
                return {
                  ...objective,
                  initiatives: processedInitiatives
                };
              })
            );
            
            const validObjectives = enrichedObjectives.filter(obj => obj !== null);
            console.log(`AdminPlanSummary: Final objectives with complete data: ${validObjectives.length}`);
            
            plan.objectives = validObjectives;
            
          } catch (error) {
            console.error('AdminPlanSummary: Error fetching complete data:', error);
          }
        }
        
        // Apply selected objective weights
        if (plan.objectives && plan.selected_objectives_weights) {
          plan.objectives = plan.objectives.map((obj: any) => {
            const weightKey = obj.id?.toString();
            const selectedWeight = plan.selected_objectives_weights[weightKey];
            
            if (selectedWeight !== undefined && selectedWeight !== null) {
              return {
                ...obj,
                effective_weight: parseFloat(selectedWeight),
                planner_weight: parseFloat(selectedWeight),
                original_weight: obj.weight
              };
            }
            
            const effectiveWeight = obj.effective_weight !== undefined ? obj.effective_weight : obj.weight;
            return {
              ...obj,
              effective_weight: effectiveWeight
            };
          });
        }
        
        return plan;
      } catch (error) {
        console.error('AdminPlanSummary: Error fetching plan:', error);
        throw error;
      }
    },
    enabled: !!planId
  });

  const plan = planData;

  // Calculate budget summary from plan data
  const calculateBudgetSummary = () => {
    let totalRequired = 0;
    let governmentTreasury = 0;
    let sdgFunding = 0;
    let partnersFunding = 0;
    let otherFunding = 0;
    let activitiesCount = 0;
    let measuresCount = 0;

    console.log('AdminPlanSummary: Starting budget calculation for plan:', plan?.id);

    if (!plan?.objectives) {
      return {
        totalRequired: 0,
        totalAllocated: 0,
        fundingGap: 0,
        governmentTreasury: 0,
        sdgFunding: 0,
        partnersFunding: 0,
        otherFunding: 0,
        activitiesCount: 0,
        measuresCount: 0
      };
    }

    plan.objectives.forEach((objective: any) => {
      if (!objective.initiatives) return;
      
      objective.initiatives.forEach((initiative: any) => {
        if (!initiative) return;
        
        // Count and process performance measures
        if (initiative.performance_measures) {
          measuresCount += initiative.performance_measures.length;
        }
        
        // Count and process main activities
        if (initiative.main_activities) {
          activitiesCount += initiative.main_activities.length;
          
          initiative.main_activities.forEach((activity: any) => {
            // Process sub-activities for budget calculation
            if (activity.sub_activities && activity.sub_activities.length > 0) {
              activity.sub_activities.forEach((subActivity: any) => {
                try {
                  const cost = subActivity.budget_calculation_type === 'WITH_TOOL'
                    ? Number(subActivity.estimated_cost_with_tool || 0)
                    : Number(subActivity.estimated_cost_without_tool || 0);

                  totalRequired += cost;
                  governmentTreasury += Number(subActivity.government_treasury || 0);
                  sdgFunding += Number(subActivity.sdg_funding || 0);
                  partnersFunding += Number(subActivity.partners_funding || 0);
                  otherFunding += Number(subActivity.other_funding || 0);
                } catch (error) {
                  console.error('AdminPlanSummary: Error processing sub-activity budget:', error);
                }
              });
            }
          });
        }
      });
    });

    const totalAllocated = governmentTreasury + sdgFunding + partnersFunding + otherFunding;
    const fundingGap = Math.max(0, totalRequired - totalAllocated);

    const summary = {
      totalRequired,
      totalAllocated,
      fundingGap,
      governmentTreasury,
      sdgFunding,
      partnersFunding,
      otherFunding,
      activitiesCount,
      measuresCount
    };

    console.log('AdminPlanSummary: Budget summary calculated:', summary);
    return summary;
  };

  const budgetSummary = calculateBudgetSummary();

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    try {
      return format(new Date(dateString), 'MMM d, yyyy');
    } catch (e) {
      return 'Invalid date';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader className="h-6 w-6 animate-spin mr-2" />
        <span>Loading plan details...</span>
      </div>
    );
  }

  if (planError || !plan) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center p-8 bg-red-50 rounded-lg border border-red-200">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-red-800 mb-2">Error Loading Plan</h3>
          <p className="text-red-600 mb-2">{(planError as Error)?.message || 'Plan not found'}</p>
          <button
            onClick={() => navigate('/admin')}
            className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Admin Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <button 
          onClick={() => navigate('/admin')}
          className="flex items-center text-gray-600 hover:text-blue-700 mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Admin Dashboard
        </button>

        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Plan Summary (Admin View)</h1>
            <p className="text-gray-600 mt-1">
              Complete plan details and budget breakdown for {plan.organization_name}
            </p>
          </div>
        </div>
      </div>

      {/* Plan Information Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <Building2 className="h-8 w-8 text-blue-600 mr-3" />
            <div>
              <p className="text-sm text-gray-500">Organization</p>
              <p className="font-medium text-gray-900">{plan.organization_name || 'Organization Name Not Available'}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <User className="h-8 w-8 text-green-600 mr-3" />
            <div>
              <p className="text-sm text-gray-500">Planner</p>
              <p className="font-medium text-gray-900">{plan.planner_name || 'Planner Name Not Available'}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <FileType className="h-8 w-8 text-purple-600 mr-3" />
            <div>
              <p className="text-sm text-gray-500">Plan Type</p>
              <p className="font-medium text-gray-900">{plan.type || 'Plan Type Not Available'}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <Calendar className="h-8 w-8 text-orange-600 mr-3" />
            <div>
              <p className="text-sm text-gray-500">Period</p>
              <p className="font-medium text-gray-900">
                {plan.from_date && plan.to_date 
                  ? `${formatDate(plan.from_date)} - ${formatDate(plan.to_date)}`
                  : 'Period Not Available'
                }
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Comprehensive Budget Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-4 rounded-lg shadow-sm text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm">Total Budget Required</p>
              <p className="text-2xl font-bold">
                ETB {budgetSummary.totalRequired.toLocaleString()}
              </p>
            </div>
            <DollarSign className="h-8 w-8 text-blue-200" />
          </div>
        </div>

        <div className="bg-gradient-to-r from-green-500 to-green-600 p-4 rounded-lg shadow-sm text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm">Total Allocated</p>
              <p className="text-2xl font-bold">
                ETB {budgetSummary.totalAllocated.toLocaleString()}
              </p>
            </div>
            <CheckCircle className="h-8 w-8 text-green-200" />
          </div>
        </div>

        <div className={`bg-gradient-to-r ${budgetSummary.fundingGap > 0 ? 'from-red-500 to-red-600' : 'from-green-500 to-green-600'} p-4 rounded-lg shadow-sm text-white`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`${budgetSummary.fundingGap > 0 ? 'text-red-100' : 'text-green-100'} text-sm`}>
                {budgetSummary.fundingGap > 0 ? 'Funding Gap' : 'Fully Funded'}
              </p>
              <p className="text-2xl font-bold">
                ETB {budgetSummary.fundingGap.toLocaleString()}
              </p>
            </div>
            {budgetSummary.fundingGap > 0 ? (
              <AlertCircle className="h-8 w-8 text-red-200" />
            ) : (
              <CheckCircle className="h-8 w-8 text-green-200" />
            )}
          </div>
        </div>

        <div className="bg-gradient-to-r from-purple-500 to-purple-600 p-4 rounded-lg shadow-sm text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-100 text-sm">Plan Status</p>
              <p className="text-2xl font-bold">{plan.status}</p>
            </div>
            <Activity className="h-8 w-8 text-purple-200" />
          </div>
        </div>
      </div>

      {/* Funding Sources Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Government Treasury</p>
              <p className="text-xl font-semibold text-green-600">
                ETB {budgetSummary.governmentTreasury.toLocaleString()}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <DollarSign className="h-6 w-6 text-green-600" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xs text-gray-500">
              {budgetSummary.totalRequired > 0 
                ? `${((budgetSummary.governmentTreasury / budgetSummary.totalRequired) * 100).toFixed(1)}% of total`
                : '0% of total'
              }
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">SDG Funding</p>
              <p className="text-xl font-semibold text-blue-600">
                ETB {budgetSummary.sdgFunding.toLocaleString()}
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
              <Target className="h-6 w-6 text-blue-600" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xs text-gray-500">
              {budgetSummary.totalRequired > 0 
                ? `${((budgetSummary.sdgFunding / budgetSummary.totalRequired) * 100).toFixed(1)}% of total`
                : '0% of total'
              }
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Partners Funding</p>
              <p className="text-xl font-semibold text-purple-600">
                ETB {budgetSummary.partnersFunding.toLocaleString()}
              </p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
              <Building2 className="h-6 w-6 text-purple-600" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xs text-gray-500">
              {budgetSummary.totalRequired > 0 
                ? `${((budgetSummary.partnersFunding / budgetSummary.totalRequired) * 100).toFixed(1)}% of total`
                : '0% of total'
              }
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Other Funding</p>
              <p className="text-xl font-semibold text-orange-600">
                ETB {budgetSummary.otherFunding.toLocaleString()}
              </p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
              <Activity className="h-6 w-6 text-orange-600" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xs text-gray-500">
              {budgetSummary.totalRequired > 0 
                ? `${((budgetSummary.otherFunding / budgetSummary.totalRequired) * 100).toFixed(1)}% of total`
                : '0% of total'
              }
            </div>
          </div>
        </div>
      </div>

      {/* Plan Statistics */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Plan Statistics</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{plan.objectives?.length || 0}</div>
            <div className="text-sm text-gray-500">Strategic Objectives</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {plan.objectives?.reduce((total: number, obj: any) => total + (obj.initiatives?.length || 0), 0) || 0}
            </div>
            <div className="text-sm text-gray-500">Strategic Initiatives</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">{budgetSummary.measuresCount}</div>
            <div className="text-sm text-gray-500">Performance Measures</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{budgetSummary.activitiesCount}</div>
            <div className="text-sm text-gray-500">Main Activities</div>
          </div>
        </div>
      </div>

      {/* Plan Review Table with Admin Context */}
      {plan.objectives && plan.objectives.length > 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h3 className="text-lg font-medium text-gray-900">Detailed Plan Breakdown (Admin View)</h3>
            <p className="text-sm text-gray-600 mt-1">
              Complete breakdown for {plan.organization_name} - showing all data without restrictions
            </p>
            <div className="text-xs text-gray-500 mt-2">
              <p>Plan Organization: {plan.organization_name} (ID: {plan.organization})</p>
              <p>Objectives: {plan.objectives.length} | 
                 Total Initiatives: {plan.objectives.reduce((sum: number, obj: any) => sum + (obj.initiatives?.length || 0), 0)} |
                 Performance Measures: {budgetSummary.measuresCount} |
                 Main Activities: {budgetSummary.activitiesCount}
              </p>
            </div>
          </div>
          
          <div className="p-6">
            <PlanReviewTable
              objectives={plan.objectives}
              onSubmit={async () => {}} // No submission needed in view mode
              isSubmitting={false}
              organizationName={plan.organization_name || 'Organization Name Not Available'}
              plannerName={plan.planner_name || 'Planner Name Not Available'}
              fromDate={plan.from_date || ''}
              toDate={plan.to_date || ''}
              planType={plan.type || 'LEO/EO Plan'}
              isViewOnly={true}
              plannerOrgId={plan.organization ? Number(plan.organization) : null}
            />
          </div>
        </div>
      ) : (
        <div className="text-center p-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
          <Info className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Objectives Data</h3>
          <p className="text-gray-500">
            This plan doesn't have complete objective data available for display.
          </p>
        </div>
      )}
    </div>
  );
};

export default AdminPlanSummary;