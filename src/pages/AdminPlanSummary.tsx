import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Building2, User, Calendar, FileType, Target, Activity, DollarSign, AlertCircle, Info, Loader, CheckCircle } from 'lucide-react';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { auth, api } from '../lib/api';
import { format } from 'date-fns';
import PlanReviewTable from '../components/PlanReviewTable';

const AdminPlanSummary: React.FC = () => {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [error, setError] = useState<string | null>(null);

  // SIMPLE ADMIN PLAN FETCH - NO RESTRICTIONS
  const { data: planData, isLoading, error: planError } = useQuery({
    queryKey: ['admin-plan-complete', planId],
    queryFn: async () => {
      if (!planId) throw new Error('Plan ID is required');
      
      console.log('AdminPlanSummary: Starting simple admin fetch for plan:', planId);
      
      try {
        // Step 1: Get basic plan data
        const planResponse = await api.get(`/plans/${planId}/`);
        const plan = planResponse.data;
        
        if (!plan) throw new Error('Plan not found');
        
        console.log('AdminPlanSummary: Plan fetched:', plan.organization_name || plan.organization);
        console.log('AdminPlanSummary: Selected objectives:', plan.selected_objectives?.length || 0);
        
        // Step 2: Get ALL objectives for this plan without any filtering
        if (plan.selected_objectives && plan.selected_objectives.length > 0) {
          const objectivesData = await Promise.all(
            plan.selected_objectives.map(async (objId: number) => {
              try {
                console.log(`AdminPlanSummary: Processing objective ${objId}`);
                
                const objResp = await api.get(`/strategic-objectives/${objId}/`);
                const objective = objResp.data;
                
                console.log(`AdminPlanSummary: Processing objective "${objective.title}"`);
                console.log(`AdminPlanSummary: Objective has ${objective.initiatives?.length || 0} initiatives from serializer`);
                
                // CRITICAL FIX: Try multiple API endpoints to get initiatives
                let allInitiatives = [];
                
                // Try the direct endpoint first
                try {
                  console.log(`AdminPlanSummary: Trying direct initiatives endpoint for objective ${objId}`);
                  const initiativesResponse = await api.get('/strategic-initiatives/', {
                    params: { strategic_objective: objId }
                  });
                  allInitiatives = initiativesResponse.data?.results || initiativesResponse.data || [];
                  console.log(`AdminPlanSummary: Direct endpoint returned ${allInitiatives.length} initiatives`);
                } catch (error) {
                  console.error(`AdminPlanSummary: Direct endpoint failed:`, error);
                }
                
                // If no initiatives found, try the serializer data first
                if (allInitiatives.length === 0 && objective.initiatives && objective.initiatives.length > 0) {
                  console.log(`AdminPlanSummary: Using initiatives from objective serializer: ${objective.initiatives.length}`);
                  allInitiatives = objective.initiatives;
                }
                
                // If still no initiatives, try without params
                if (allInitiatives.length === 0) {
                  try {
                    console.log(`AdminPlanSummary: Trying to get all initiatives and filter manually`);
                    const allInitiativesResponse = await api.get('/strategic-initiatives/');
                    const allInits = allInitiativesResponse.data?.results || allInitiativesResponse.data || [];
                    allInitiatives = allInits.filter((init: any) => 
                      init.strategic_objective && Number(init.strategic_objective) === Number(objId)
                    );
                    console.log(`AdminPlanSummary: Manual filter found ${allInitiatives.length} initiatives for objective ${objId}`);
                  } catch (error) {
                    console.error(`AdminPlanSummary: Manual filtering failed:`, error);
                  }
                }
                
                // Get ALL initiatives for this objective
                const initResp = await api.get(`/strategic-initiatives/?strategic_objective=${objId}`);
                const allInitiatives2 = initResp.data?.results || initResp.data || [];
                
                console.log(`AdminPlanSummary: API returned ${allInitiatives2.length} initiatives for objective ${objId}`);
                
                // CRITICAL: Use the fetched initiatives, not the ones from serializer
                if (allInitiatives.length === 0) {
                  console.warn(`AdminPlanSummary: No initiatives found for objective ${objId}`);
                  console.warn(`AdminPlanSummary: FINAL - No initiatives found for objective ${objId} "${objective.title}"`);
                  return {
                    ...objective,
                    initiatives: []
                  };
                }
                
                // For each initiative, get ALL its data
                const completeInitiatives = await Promise.all(
                  allInitiatives.map(async (initiative: any) => {
                    console.log(`AdminPlanSummary: Processing initiative "${initiative.name}"`);
                    
                    // Get ALL performance measures
                    const measuresResp = await api.get(`/performance-measures/?initiative=${initiative.id}`);
                    const allMeasures = measuresResp.data?.results || measuresResp.data || [];
                    
                    // Get ALL main activities  
                    const activitiesResp = await api.get(`/main-activities/?initiative=${initiative.id}`);
                    const allActivities = activitiesResp.data?.results || activitiesResp.data || [];
                    
                    // For each activity, get sub-activities
                    const activitiesWithSubs = await Promise.all(
                      allActivities.map(async (activity: any) => {
                        try {
                          const subResp = await api.get(`/sub-activities/?main_activity=${activity.id}`);
                          const subs = subResp.data?.results || subResp.data || [];
                          
                          return { ...activity, sub_activities: subs };
                        } catch (error) {
                          console.error(`Error getting subs for activity ${activity.id}:`, error);
                          return { ...activity, sub_activities: [] };
                        }
                      })
                    );
                    
                    console.log(`AdminPlanSummary: Initiative "${initiative.name}" complete: ${allMeasures.length} measures, ${activitiesWithSubs.length} activities`);
                    
                    return {
                      ...initiative,
                      performance_measures: allMeasures,
                      main_activities: activitiesWithSubs
                    };
                  })
                );
                
                // CRITICAL: Make sure we return the objective with the processed initiatives
                return {
                  ...objective,
                  initiatives: completeInitiatives
                };
              } catch (error) {
                console.error(`AdminPlanSummary: Error processing objective ${objId}:`, error);
                return null;
              }
            })
          );
          
          const validObjectives = objectivesData.filter(obj => obj !== null);
          console.log(`AdminPlanSummary: Complete data assembled: ${validObjectives.length} objectives`);
          
          // Log final initiative counts for debugging
          validObjectives.forEach((obj: any) => {
            console.log(`AdminPlanSummary FINAL: Objective "${obj.title}" has ${obj.initiatives?.length || 0} initiatives`);
          });
          
          // Apply weights
          if (plan.selected_objectives_weights) {
            validObjectives.forEach((obj: any) => {
              const weightKey = obj.id?.toString();
              const selectedWeight = plan.selected_objectives_weights[weightKey];
              
              if (selectedWeight !== undefined) {
                obj.effective_weight = parseFloat(selectedWeight);
                obj.planner_weight = parseFloat(selectedWeight);
              }
            });
          }
          
          plan.objectives = validObjectives;
        }
        
        // REMOVED: Don't check admin permissions for plan viewing
        // Admin should be able to view any plan details
        console.log('AdminPlanSummary: User authenticated, proceeding without role restrictions');
        
        return plan;
      } catch (error) {
        console.error('AdminPlanSummary: Error:', error);
        throw error;
      }
    },
    enabled: !!planId
  });

  const plan = planData;

  // SIMPLE BUDGET CALCULATION - NO FILTERING
  const calculateBudgetSummary = () => {
    let totalRequired = 0;
    let governmentTreasury = 0;
    let sdgFunding = 0;
    let partnersFunding = 0;
    let otherFunding = 0;
    let activitiesCount = 0;
    let measuresCount = 0;

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
        
        // Count measures
        if (initiative.performance_measures) {
          measuresCount += initiative.performance_measures.length;
        }
        
        // Count and process activities
        if (initiative.main_activities) {
          activitiesCount += initiative.main_activities.length;
          
          initiative.main_activities.forEach((activity: any) => {
            // Get budget from sub-activities
            if (activity.sub_activities && activity.sub_activities.length > 0) {
              activity.sub_activities.forEach((subActivity: any) => {
                const cost = subActivity.budget_calculation_type === 'WITH_TOOL'
                  ? Number(subActivity.estimated_cost_with_tool || 0)
                  : Number(subActivity.estimated_cost_without_tool || 0);

                totalRequired += cost;
                governmentTreasury += Number(subActivity.government_treasury || 0);
                sdgFunding += Number(subActivity.sdg_funding || 0);
                partnersFunding += Number(subActivity.partners_funding || 0);
                otherFunding += Number(subActivity.other_funding || 0);
              });
            } else if (activity.budget) {
              // Legacy budget
              const cost = activity.budget.budget_calculation_type === 'WITH_TOOL'
                ? Number(activity.budget.estimated_cost_with_tool || 0)
                : Number(activity.budget.estimated_cost_without_tool || 0);

              totalRequired += cost;
              governmentTreasury += Number(activity.budget.government_treasury || 0);
              sdgFunding += Number(activity.budget.sdg_funding || 0);
              partnersFunding += Number(activity.budget.partners_funding || 0);
              otherFunding += Number(activity.budget.other_funding || 0);
            }
          });
        }
      });
    });

    const totalAllocated = governmentTreasury + sdgFunding + partnersFunding + otherFunding;
    const fundingGap = Math.max(0, totalRequired - totalAllocated);

    return {
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
        <span>Loading complete plan details...</span>
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

      {/* Budget Summary Cards */}
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

      {/* Debug Info */}
      <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200 mb-6">
        <h4 className="font-medium text-yellow-800 mb-2">Debug Information (Admin Only)</h4>
        <div className="text-sm text-yellow-700 grid grid-cols-2 gap-4">
          <div>
            <p>Plan ID: {planId}</p>
            <p>Organization: {plan.organization_name} (ID: {plan.organization})</p>
            <p>Selected Objectives: {plan.selected_objectives?.length || 0}</p>
          </div>
          <div>
            <p>Processed Objectives: {plan.objectives?.length || 0}</p>
            <p>Total Initiatives: {(() => {
              const total = plan.objectives?.reduce((sum: number, obj: any) => {
                const initCount = obj.initiatives?.length || 0;
                console.log(`Debug: Objective "${obj.title}" has ${initCount} initiatives`);
                return sum + initCount;
              }, 0) || 0;
              console.log(`Debug: Final total initiatives: ${total}`);
              return total;
            })()}</p>
            <p>Total Measures: {budgetSummary.measuresCount}</p>
            <p>Status: {plan.status}</p>
            <p>Fetch Error: {planError ? 'Yes' : 'No'}</p>
          </div>
        </div>
        
        {/* Additional debug info */}
        <div className="mt-3 text-xs text-yellow-600">
          <p>Raw Objectives Data Check:</p>
          {plan.objectives?.map((obj: any, idx: number) => (
            <div key={idx} className="ml-4">
              <p>• {obj.title}: {obj.initiatives?.length || 0} initiatives</p>
              {obj.initiatives?.map((init: any, initIdx: number) => (
                <div key={initIdx} className="ml-8">
                  <p>  - {init.name}: {init.performance_measures?.length || 0} measures, {init.main_activities?.length || 0} activities</p>
                </div>
              ))}
            </div>
          ))}
        </div>
        
        <div className="mt-3 text-xs text-yellow-600">
          <p>Budget Calculation Debug:</p>
          <div className="ml-4">
            <p>• Activities Count: {budgetSummary.activitiesCount}</p>
            <p>• Measures Count: {budgetSummary.measuresCount}</p>
            <p>• Total Required: ETB {budgetSummary.totalRequired}</p>
          </div>
        </div>
      </div>

      {/* Plan Details Table */}
      {plan.objectives && plan.objectives.length > 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h3 className="text-lg font-medium text-gray-900">Complete Plan Details (Admin View)</h3>
            <p className="text-sm text-gray-600 mt-1">
              Showing all data for {plan.organization_name} - Admin unrestricted view
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Initiative Count Check: {plan.objectives?.reduce((sum: number, obj: any) => sum + (obj.initiatives?.length || 0), 0) || 0} total initiatives loaded
            </p>
          </div>
          
          <div className="p-6">
            {(() => {
              console.log('AdminPlanSummary: Rendering PlanReviewTable with objectives:', plan.objectives?.length);
              plan.objectives?.forEach((obj: any) => {
                console.log(`  Objective: ${obj.title} has ${obj.initiatives?.length || 0} initiatives`);
              });
              return null;
            })()}
            
            <PlanReviewTable
              objectives={plan.objectives}
              onSubmit={async () => {}}
              isSubmitting={false}
              organizationName={plan.organization_name || 'Organization Name Not Available'}
              plannerName={plan.planner_name || 'Planner Name Not Available'}
              fromDate={plan.from_date || ''}
              toDate={plan.to_date || ''}
              planType={plan.type || 'LEO/EO Plan'}
              isViewOnly={true}
              plannerOrgId={null}
            />
          </div>
        </div>
      ) : (
        <div className="text-center p-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
          <Info className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Complete Data</h3>
          <p className="text-gray-500">
            Could not load complete objectives data for this plan. 
            {plan?.selected_objectives?.length > 0 ? 
              `Found ${plan.selected_objectives.length} selected objectives but failed to load their details.` :
              'No selected objectives found in the plan.'
            }
          </p>
          <div className="mt-4 text-xs text-gray-400">
            <p>Plan Data Debug:</p>
            <p>• Selected Objectives IDs: {plan?.selected_objectives?.join(', ') || 'None'}</p>
            <p>• Organization: {plan?.organization_name} (ID: {plan?.organization})</p>
            <p>• Plan Status: {plan?.status}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPlanSummary;