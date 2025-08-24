import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mainActivities, auth, api, subActivities } from '../lib/api';
import { BarChart3, AlertCircle, CheckCircle, Edit, Trash2, Lock, PlusCircle, Info, Loader, DollarSign, Plus, Eye, X, Calculator, Activity, Building2 } from 'lucide-react';
import { useLanguage } from '../lib/i18n/LanguageContext';
import type { MainActivity } from '../types/plan';
import { isPlanner } from '../types/user';
import ActivityBudgetForm from './ActivityBudgetForm';
import TrainingCostingTool from './TrainingCostingTool';
import MeetingWorkshopCostingTool from './MeetingWorkshopCostingTool';
import PrintingCostingTool from './PrintingCostingTool';
import ProcurementCostingTool from './ProcurementCostingTool';
import SupervisionCostingTool from './SupervisionCostingTool';

interface SubActivity {
  id: string;
  name: string;
  description?: string;
  activity_type: string;
  budget_calculation_type: 'WITH_TOOL' | 'WITHOUT_TOOL';
  estimated_cost_with_tool?: number;
  estimated_cost_without_tool?: number;
  government_treasury?: number;
  sdg_funding?: number;
  partners_funding?: number;
  other_funding?: number;
}

interface MainActivityListProps {
  initiativeId: string;
  initiativeWeight: number;
  onEditActivity: (activity: MainActivity) => void;
  onSelectActivity?: (activity: MainActivity) => void;
  onAddSubActivity?: (activity: MainActivity) => void;
  onViewActivityBudget?: (activity: MainActivity) => void;
  onEditSubActivityBudget?: (subActivity: SubActivity) => void;
  onViewSubActivity?: (subActivity: SubActivity) => void;
  isNewPlan?: boolean;
  planKey?: string;
}

const ACTIVITY_TYPES = [
  { value: 'Training', label: 'Training', icon: '📚', description: 'Training activities and capacity building' },
  { value: 'Meeting', label: 'Meeting', icon: '👥', description: 'Meetings and workshops' },
  { value: 'Workshop', label: 'Workshop', icon: '🔧', description: 'Workshops and working sessions' },
  { value: 'Printing', label: 'Printing', icon: '🖨️', description: 'Printing and documentation' },
  { value: 'Procurement', label: 'Procurement', icon: '📦', description: 'Procurement and purchasing' },
  { value: 'Supervision', label: 'Supervision', icon: '👁️', description: 'Supervision and monitoring' },
  { value: 'Other', label: 'Other', icon: '⚙️', description: 'Other activities' }
];

// ID normalization utility
const normalizeId = (id: any): string | null => {
  if (id === null || id === undefined) return null;
  if (typeof id === 'string') return id.trim();
  return String(id);
};

const MainActivityList: React.FC<MainActivityListProps> = ({
  initiativeId,
  initiativeWeight,
  onEditActivity,
  onSelectActivity,
  onAddSubActivity,
  onViewActivityBudget,
  onEditSubActivityBudget,
  onViewSubActivity,
  isNewPlan = false,
  planKey = 'default',
}) => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [isUserPlanner, setIsUserPlanner] = useState(false);
  const [userOrgId, setUserOrgId] = useState<number | null>(null);
  const [validationSuccess, setValidationSuccess] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isLoadingWeights, setIsLoadingWeights] = useState(true);
  
  // Modal states
  const [selectedActivity, setSelectedActivity] = useState<MainActivity | null>(null);
  const [showActivityTypeModal, setShowActivityTypeModal] = useState(false);
  const [showCostingModal, setShowCostingModal] = useState(false);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedActivityType, setSelectedActivityType] = useState<string>('');
  const [selectedSubActivity, setSelectedSubActivity] = useState<any>(null);
  const [costingToolData, setCostingToolData] = useState<any>(null);

  // Fetch user permissions
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const authData = await auth.getCurrentUser();
        const plannerStatus = isPlanner(authData.userOrganizations);
        setIsUserPlanner(plannerStatus);
        if (authData.userOrganizations?.length > 0) {
          setUserOrgId(authData.userOrganizations[0].organization);
        } else {
          console.warn('No user organizations found');
          setActionError('No organization data available.');
          setTimeout(() => setActionError(null), 5000);
        }
      } catch (error) {
        console.error('Failed to fetch user data:', error);
        setActionError('Failed to load user permissions.');
        setTimeout(() => setActionError(null), 5000);
      } finally {
        setIsLoadingWeights(false);
      }
    };
    fetchUserData();
  }, []);

  // Fetch main activities
  const { data: activitiesList, isLoading, refetch } = useQuery({
    queryKey: ['main-activities', initiativeId, planKey],
    queryFn: async () => {
      if (!initiativeId) {
        console.warn('Missing initiativeId');
        return { data: [] };
      }
      console.log(`Fetching main activities for initiative ${initiativeId}`);
      try {
        const response = await api.get(`/main-activities/?initiative=${initiativeId}`);
        const activities = response.data?.results || response.data || [];
        console.log(`Fetched ${activities.length} activities`, activities);
        return { data: activities };
      } catch (error) {
        console.error('Error fetching activities:', error);
        setActionError('Failed to load activities.');
        setTimeout(() => setActionError(null), 5000);
        return { data: [] };
      }
    },
    enabled: !!initiativeId && !!userOrgId,
    staleTime: 0,
    cacheTime: 0,
  });

  // Delete main activity mutation
  const deleteActivityMutation = useMutation({
    mutationFn: async (activityId: string) => {
      console.log(`Deleting main activity: ${activityId}`);
      try {
        const response = await mainActivities.delete(activityId);
        console.log('Main activity deleted successfully:', response);
        return response;
      } catch (error) {
        console.error('Error deleting main activity:', error);
        throw error;
      }
    },
    onSuccess: () => {
      console.log('Main activity deletion successful, refreshing data...');
      queryClient.invalidateQueries({ queryKey: ['main-activities', initiativeId] });
      queryClient.invalidateQueries({ queryKey: ['initiatives'] });
      setValidationSuccess('Main activity deleted successfully');
      setTimeout(() => setValidationSuccess(null), 3000);
      refetch();
    },
    onError: (error: any) => {
      console.error('Failed to delete main activity:', error);
      let errorMessage = 'Failed to delete main activity. Please try again.';
      
      if (error.response) {
        if (error.response.status === 404) {
          errorMessage = 'Main activity not found. It may have already been deleted.';
        } else if (error.response.status === 403) {
          errorMessage = 'You do not have permission to delete this main activity.';
        } else if (error.response.status === 400) {
          errorMessage = 'Cannot delete main activity. It may have dependent sub-activities.';
        }
      }
      
      setActionError(errorMessage);
      setTimeout(() => setActionError(null), 5000);
    }
  });

  // Enhanced delete sub-activity mutation with production-friendly error handling
  const deleteSubActivityMutation = useMutation({
    mutationFn: async (subActivityId: string) => {
      console.log(`Deleting sub-activity: ${subActivityId}`);
      try {
        const response = await subActivities.delete(subActivityId);
        console.log('Sub-activity deleted successfully:', response);
        return response;
      } catch (error) {
        console.error('Error deleting sub-activity:', error);
        throw error;
      }
    },
    onSuccess: () => {
      console.log('Sub-activity deletion successful, refreshing data...');
      queryClient.invalidateQueries({ queryKey: ['main-activities', initiativeId] });
      setValidationSuccess('Sub-activity deleted successfully');
      setTimeout(() => setValidationSuccess(null), 3000);
      refetch();
    },
    onError: (error: any) => {
      console.error('Failed to delete sub-activity:', error);
      
      let errorMessage = 'Failed to delete sub-activity. Please try again.';
      
      if (error.response) {
        if (error.response.status === 404) {
          errorMessage = 'Sub-activity not found. It may have already been deleted.';
        } else if (error.response.status === 403) {
          errorMessage = 'You do not have permission to delete this sub-activity.';
        } else if (error.response.status === 400) {
          errorMessage = 'Cannot delete sub-activity. Please check for dependencies.';
        }
      }
      
      setActionError(errorMessage);
      setTimeout(() => setActionError(null), 5000);
    }
  });

  // Create sub-activity mutation
  const createSubActivityMutation = useMutation({
    mutationFn: async (subActivityData: any) => {
      console.log('Creating sub-activity:', subActivityData);
      return await api.post('/sub-activities/', subActivityData);
    },
    onError: (err: any) => {
      console.error('Failed to create sub-activity:', err);
      setActionError(err.response?.data?.detail || 'Failed to create sub-activity.');
      setTimeout(() => setActionError(null), 5000);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['main-activities', initiativeId] });
      refetch();
      closeAllModals();
    }
  });

  // Update sub-activity mutation
  const updateSubActivityMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      console.log(`Updating sub-activity: ${id}`);
      return await api.put(`/sub-activities/${id}/`, data);
    },
    onError: (err: any) => {
      console.error('Failed to update sub-activity:', err);
      setActionError(err.response?.data?.detail || 'Failed to update sub-activity.');
      setTimeout(() => setActionError(null), 5000);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['main-activities', initiativeId] });
      refetch();
      closeAllModals();
    }
  });

  // Filter activities by organization
  const filteredActivities = React.useMemo(() => {
    if (!activitiesList?.data || !userOrgId) return [];
    const activities = activitiesList.data.filter((activity: any) => {
      const shouldInclude = !activity.organization || Number(activity.organization) === Number(userOrgId);
      return shouldInclude;
    });
    return activities;
  }, [activitiesList?.data, userOrgId]);

  // Calculate weights
  const { totalActivitiesWeight, maxAllowedWeight, remainingWeight, isWeightValid } = React.useMemo(() => {
    try {
      const totalWeight = filteredActivities.reduce((sum: number, activity: any) => sum + (Number(activity.weight) || 0), 0);
      const maxAllowed = Number(initiativeWeight) * 0.65;
      const remaining = maxAllowed - totalWeight;
      const isValid = totalWeight <= maxAllowed;
      return { totalActivitiesWeight: totalWeight, maxAllowedWeight: maxAllowed, remainingWeight: remaining, isWeightValid: isValid };
    } catch (error) {
      console.error('Error calculating weights:', error);
      setActionError('Failed to calculate weights.');
      setTimeout(() => setActionError(null), 5000);
      return { totalActivitiesWeight: 0, maxAllowedWeight: 0, remainingWeight: 0, isWeightValid: true };
    }
  }, [filteredActivities, initiativeWeight]);

  // Close all modals
  const closeAllModals = () => {
    setShowActivityTypeModal(false);
    setShowCostingModal(false);
    setShowBudgetModal(false);
    setShowViewModal(false);
    setSelectedActivity(null);
    setSelectedSubActivity(null);
    setSelectedActivityType('');
    setCostingToolData(null);
  };

  // Handle add sub-activity click
  const handleAddSubActivity = (activity: MainActivity, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedActivity(activity);
    setSelectedSubActivity(null);
    setShowActivityTypeModal(true);
  };

  // Handle activity type selection
  const handleActivityTypeSelect = (activityType: string) => {
    setSelectedActivityType(activityType);
    setShowActivityTypeModal(false);

    if (activityType === 'Other') {
      setCostingToolData(null);
      setShowBudgetModal(true);
    } else {
      setShowCostingModal(true);
    }
  };

  // Handle costing calculation
  const handleCostingCalculation = (costingData: any) => {
    setCostingToolData({
      ...costingData,
      activity_type: selectedActivityType
    });
    setShowCostingModal(false);
    setShowBudgetModal(true);
  };

  // Handle budget form submission
  const handleBudgetSubmit = async (budgetData: any) => {
    try {
      const subActivityData = {
        main_activity: selectedActivity?.id,
        name: budgetData.name || `${selectedActivityType} Activity`,
        activity_type: selectedActivityType,
        description: budgetData.description || '',
        budget_calculation_type: costingToolData ? 'WITH_TOOL' : 'WITHOUT_TOOL',
        estimated_cost_with_tool: costingToolData?.totalBudget || 0,
        estimated_cost_without_tool: budgetData.estimated_cost_without_tool || 0,
        government_treasury: budgetData.government_treasury || 0,
        sdg_funding: budgetData.sdg_funding || 0,
        partners_funding: budgetData.partners_funding || 0,
        other_funding: budgetData.other_funding || 0,
        training_details: costingToolData?.training_details || budgetData.training_details,
        meeting_workshop_details: costingToolData?.meeting_workshop_details || budgetData.meeting_workshop_details,
        procurement_details: costingToolData?.procurement_details || budgetData.procurement_details,
        printing_details: costingToolData?.printing_details || budgetData.printing_details,
        supervision_details: costingToolData?.supervision_details || budgetData.supervision_details,
        partners_details: budgetData.partners_details
      };

      if (selectedSubActivity) {
        await updateSubActivityMutation.mutateAsync({
          id: selectedSubActivity.id,
          data: subActivityData
        });
      } else {
        await createSubActivityMutation.mutateAsync(subActivityData);
      }
    } catch (error) {
      console.error('Error saving sub-activity:', error);
      throw error;
    }
  };

  // Handle view sub-activity
  const handleViewSubActivity = (activity: MainActivity, subActivity: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedActivity(activity);
    setSelectedSubActivity(subActivity);
    setShowViewModal(true);
  };

  // Handle edit sub-activity
  const handleEditSubActivity = (activity: MainActivity, subActivity: any) => {
    setSelectedActivity(activity);
    setSelectedSubActivity(subActivity);
    setSelectedActivityType(subActivity.activity_type || 'Other');

    if (subActivity.budget_calculation_type === 'WITH_TOOL') {
      setCostingToolData({
        totalBudget: subActivity.estimated_cost_with_tool,
        activity_type: subActivity.activity_type,
        training_details: subActivity.training_details,
        meeting_workshop_details: subActivity.meeting_workshop_details,
        procurement_details: subActivity.procurement_details,
        printing_details: subActivity.printing_details,
        supervision_details: subActivity.supervision_details
      });
      setShowCostingModal(true);
    } else {
      setShowBudgetModal(true);
    }
  };

  // Handle sub-activity deletion with confirmation
  const handleDeleteSubActivity = (subActivityId: string, subActivityName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    // Clear any previous messages
    setValidationSuccess(null);
    setActionError(null);

    if (window.confirm(`Are you sure you want to delete the sub-activity "${subActivityName}"? This action cannot be undone.`)) {
      deleteSubActivityMutation.mutate(subActivityId);
    }
  };

  // Handle activity deletion
  const handleDeleteActivity = (activityId: string, activityName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    if (window.confirm(`Are you sure you want to delete "${activityName}" and all its sub-activities? This action cannot be undone.`)) {
      console.log(`Confirming deletion of main activity: ${activityId}`);
      deleteActivityMutation.mutate(activityId);
    }
  };

  // Handle activity validation
  const handleValidateActivities = () => {
    if (isWeightValid) {
      setValidationSuccess(`Weights valid (${totalActivitiesWeight.toFixed(1)}% ≤ ${maxAllowedWeight.toFixed(1)}%)`);
      setTimeout(() => setValidationSuccess(null), 3000);
    } else {
      setValidationError(`Weights exceed limit (${totalActivitiesWeight.toFixed(1)}% > ${maxAllowedWeight.toFixed(1)}%)`);
      setTimeout(() => setValidationError(null), 5000);
    }
  };

  // Render costing tool based on activity type
  const renderCostingTool = () => {
    const costingProps = {
      onCalculate: handleCostingCalculation,
      onCancel: () => setShowCostingModal(false),
      initialData: selectedSubActivity
    };

    switch (selectedActivityType) {
      case 'Training':
        return <TrainingCostingTool {...costingProps} />;
      case 'Meeting':
      case 'Workshop':
        return <MeetingWorkshopCostingTool {...costingProps} />;
      case 'Printing':
        return <PrintingCostingTool {...costingProps} />;
      case 'Procurement':
        return <ProcurementCostingTool {...costingProps} />;
      case 'Supervision':
        return <SupervisionCostingTool {...costingProps} />;
      default:
        return null;
    }
  };

  if (isLoading || isLoadingWeights) {
    return (
      <div className="text-center p-4">
        <Loader className="h-6 w-6 animate-spin mx-auto mb-2" />
        {t('common.loading')}
      </div>
    );
  }

  if (actionError) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <div className="flex items-center">
          <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
          <p className="text-sm text-red-600">{actionError}</p>
        </div>
        <button onClick={() => setActionError(null)} className="mt-2 text-sm text-red-600 hover:text-red-800 underline">
          Dismiss
        </button>
      </div>
    );
  }

  if (!activitiesList?.data || filteredActivities.length === 0) {
    return (
      <div className="space-y-4">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">Weight Distribution (65% Rule)</h3>
            <BarChart3 className="h-5 w-5 text-gray-400" />
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-sm text-gray-500">Initiative Weight</p>
              <p className="text-2xl font-semibold text-gray-900">{initiativeWeight}%</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Max Allowed (65%)</p>
              <p className="text-2xl font-semibold text-blue-600">{maxAllowedWeight.toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Available</p>
              <p className="text-2xl font-semibold text-green-600">{maxAllowedWeight.toFixed(1)}%</p>
            </div>
          </div>
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-sm text-blue-700 flex items-center">
              <Info className="h-4 w-4 mr-2" />
              Main activities can use up to 65% of initiative weight ({initiativeWeight}%).
            </p>
          </div>
        </div>
        <div className="text-center p-8 bg-white rounded-lg border-2 border-dashed border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Main Activities Found</h3>
          <p className="text-gray-500 mb-4">No main activities created yet.</p>
          {isUserPlanner ? (
            <button
              onClick={() => onEditActivity({} as MainActivity)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-orange-600 hover:bg-orange-700"
            >
              <PlusCircle className="h-4 w-4 mr-2" />
              Create Main Activity
            </button>
          ) : (
            <p className="text-sm text-gray-500 flex items-center justify-center">
              <Lock className="h-4 w-4 mr-2" />
              You lack permissions to create activities.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Error display */}
      {actionError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
            <p className="text-sm text-red-600">{actionError}</p>
          </div>
          <button 
            onClick={() => setActionError(null)} 
            className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Success message */}
      {validationSuccess && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center">
            <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
            <p className="text-sm text-green-600">{validationSuccess}</p>
          </div>
        </div>
      )}

      {/* Activity Type Selection Modal */}
      {showActivityTypeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-medium text-gray-900">
                  Select Activity Type - {selectedActivity?.name}
                </h3>
                <button
                  onClick={closeAllModals}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {ACTIVITY_TYPES.map((type) => (
                  <button
                    key={type.value}
                    onClick={() => handleActivityTypeSelect(type.value)}
                    className="p-4 text-left border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
                  >
                    <div className="flex items-center mb-2">
                      <span className="text-2xl mr-3">{type.icon}</span>
                      <h4 className="font-medium text-gray-900">{type.label}</h4>
                    </div>
                    <p className="text-sm text-gray-500">{type.description}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Costing Tool Modal */}
      {showCostingModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900 flex items-center">
                  <Calculator className="h-5 w-5 mr-2 text-blue-600" />
                  {selectedActivityType} Cost Calculator - {selectedActivity?.name}
                </h3>
                <button
                  onClick={closeAllModals}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              {renderCostingTool()}
            </div>
          </div>
        </div>
      )}

      {/* Budget Form Modal */}
      {showBudgetModal && selectedActivity && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                {selectedSubActivity ? 'Edit' : 'Add'} Sub-Activity Budget - {selectedActivity.name}
              </h3>

              <ActivityBudgetForm
                activity={selectedActivity}
                budgetCalculationType={costingToolData ? 'WITH_TOOL' : 'WITHOUT_TOOL'}
                activityType={selectedActivityType || null}
                onSubmit={handleBudgetSubmit}
                initialData={selectedSubActivity}
                costingToolData={costingToolData}
                onCancel={closeAllModals}
                isSubmitting={createSubActivityMutation.isPending || updateSubActivityMutation.isPending}
              />
            </div>
          </div>
        </div>
      )}

      {/* View Sub-Activity Modal */}
      {showViewModal && selectedSubActivity && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-medium text-gray-900">
                  Sub-Activity Details - {selectedSubActivity.name}
                </h3>
                <button
                  onClick={closeAllModals}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Activity Type</label>
                    <p className="text-gray-900">{selectedSubActivity.activity_type}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Calculation Method</label>
                    <p className="text-gray-900">
                      {selectedSubActivity.budget_calculation_type === 'WITH_TOOL' ? 'Using Costing Tool' : 'Manual Entry'}
                    </p>
                  </div>
                </div>

                {selectedSubActivity.description && (
                  <div>
                    <label className="text-sm font-medium text-gray-700">Description</label>
                    <p className="text-gray-900">{selectedSubActivity.description}</p>
                  </div>
                )}

                <div className="border-t border-gray-200 pt-4">
                  <h4 className="text-md font-medium text-gray-900 mb-3">Budget Information</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700">Estimated Cost</label>
                      <p className="text-lg font-semibold text-green-600">
                        ETB {selectedSubActivity.budget_calculation_type === 'WITH_TOOL'
                          ? Number(selectedSubActivity.estimated_cost_with_tool || 0).toLocaleString()
                          : Number(selectedSubActivity.estimated_cost_without_tool || 0).toLocaleString()
                        }
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Total Funding</label>
                      <p className="text-lg font-semibold text-blue-600">
                        ETB {(
                          Number(selectedSubActivity.government_treasury || 0) +
                          Number(selectedSubActivity.sdg_funding || 0) +
                          Number(selectedSubActivity.partners_funding || 0) +
                          Number(selectedSubActivity.other_funding || 0)
                        ).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Government Treasury:</span>
                      <span>ETB {Number(selectedSubActivity.government_treasury || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">SDG Funding:</span>
                      <span>ETB {Number(selectedSubActivity.sdg_funding || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Partners Funding:</span>
                      <span>ETB {Number(selectedSubActivity.partners_funding || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Other Funding:</span>
                      <span>ETB {Number(selectedSubActivity.other_funding || 0).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end space-x-3">
                  <button
                    onClick={closeAllModals}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Close
                  </button>
                  {isUserPlanner && (
                    <button
                      onClick={() => {
                        setShowViewModal(false);
                        handleEditSubActivity(selectedActivity!, selectedSubActivity);
                      }}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700"
                    >
                      Edit Sub-Activity
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Weight Distribution Card */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">Weight Distribution (65% Rule)</h3>
          <BarChart3 className="h-5 w-5 text-gray-400" />
        </div>
        <div className="grid grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-sm text-gray-500">Initiative Weight</p>
            <p className="text-2xl font-semibold text-gray-900">{initiativeWeight}%</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Max Allowed (65%)</p>
            <p className="text-2xl font-semibold text-blue-600">{maxAllowedWeight.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Current Total</p>
            <p className="text-2xl font-semibold text-orange-600">{totalActivitiesWeight.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Remaining</p>
            <p className={`text-2xl font-semibold ${isWeightValid ? 'text-green-600' : 'text-red-600'}`}>
              {remainingWeight.toFixed(1)}%
            </p>
          </div>
        </div>
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <p className="text-sm text-blue-700 flex items-center">
            <Info className="h-4 w-4 mr-2" />
            Main activities: {totalActivitiesWeight.toFixed(1)}% / {maxAllowedWeight.toFixed(1)}%
          </p>
        </div>
        {validationSuccess && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md flex items-center text-green-700">
            <CheckCircle className="h-5 w-5 mr-2" />
            <p className="text-sm">{validationSuccess}</p>
          </div>
        )}
        {validationError && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-center text-red-700">
            <AlertCircle className="h-5 w-5 mr-2" />
            <p className="text-sm">{validationError}</p>
          </div>
        )}
        {isUserPlanner && (
          <div className="mt-4">
            <button
              onClick={handleValidateActivities}
              disabled={filteredActivities.length === 0}
              className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50"
            >
              Validate Weights
            </button>
          </div>
        )}
      </div>

      {/* Main Activities List */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-700">Main Activities ({filteredActivities.length})</h3>
        {filteredActivities.map((activity: any) => {
          const budgetRequired = activity.sub_activities?.reduce((sum: number, sub: SubActivity) => {
            return sum + (sub.budget_calculation_type === 'WITH_TOOL' ? Number(sub.estimated_cost_with_tool || 0) : Number(sub.estimated_cost_without_tool || 0));
          }, 0) || 0;
          const totalFunding = activity.sub_activities?.reduce((sum: number, sub: SubActivity) => {
            return sum + Number(sub.government_treasury || 0) + Number(sub.sdg_funding || 0) + Number(sub.partners_funding || 0) + Number(sub.other_funding || 0);
          }, 0) || 0;
          const fundingGap = Math.max(0, budgetRequired - totalFunding);
          return (
            <div
              key={activity.id}
              onClick={() => onSelectActivity?.(activity)}
              className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:border-orange-300 cursor-pointer"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center">
                  <Activity className="h-5 w-5 text-orange-600 mr-2" />
                  <div>
                    <h4 className="font-medium text-gray-900">{activity.name}</h4>
                    <div className="flex items-center mt-1 space-x-3">
                      <span className="text-sm font-medium text-orange-600">{activity.weight}%</span>
                      {activity.organization_name && (
                        <div className="flex items-center text-sm text-gray-600">
                          <Building2 className="h-3 w-3 mr-1" />
                          <span>{activity.organization_name}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <span className="text-sm font-medium text-orange-600">{activity.weight}%</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2 text-xs text-gray-500">
                <div>Baseline: {activity.baseline || 'N/A'}</div>
                <div>Annual Target: {activity.annual_target || 0}</div>
                <div>Q1: {activity.q1_target || 0}</div>
                <div>Q2: {activity.q2_target || 0}</div>
                <div>Q3: {activity.q3_target || 0}</div>
                <div>Q4: {activity.q4_target || 0}</div>
              </div>
              <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <h5 className="text-sm font-medium text-gray-700 flex items-center">
                    <DollarSign className="h-4 w-4 mr-1" />
                    Sub-Activities ({activity.sub_activities?.length || 0})
                  </h5>
                  {budgetRequired > 0 && (
                    <div className="text-xs text-gray-600">Total Budget: ETB {budgetRequired.toLocaleString()}</div>
                  )}
                </div>
                {activity.sub_activities?.length > 0 ? (
                  activity.sub_activities.map((subActivity: SubActivity) => {
                    const subCost = subActivity.budget_calculation_type === 'WITH_TOOL'
                      ? Number(subActivity.estimated_cost_with_tool || 0)
                      : Number(subActivity.estimated_cost_without_tool || 0);
                    const subFunding = Number(subActivity.government_treasury || 0) +
                                      Number(subActivity.sdg_funding || 0) +
                                      Number(subActivity.partners_funding || 0) +
                                      Number(subActivity.other_funding || 0);
                    const subGap = Math.max(0, subCost - subFunding);
                    return (
                      <div
  key={subActivity.id}
  className="bg-white p-3 rounded border border-gray-200 mb-2"
>
  <div className="flex items-center justify-between mb-2 gap-2">
    <div className="flex items-center min-w-0 flex-1">
      <span className="text-sm font-medium text-gray-900 truncate">
        {subActivity.name}
      </span>
      <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full flex-shrink-0">
        {subActivity.activity_type}
      </span>
    </div>
    <div className="flex items-center space-x-1 flex-shrink-0">
      <button
        onClick={(e) => handleViewSubActivity(activity, subActivity, e)}
        className="text-xs text-gray-600 hover:text-gray-800 flex items-center p-1 rounded hover:bg-gray-50"
        title="View sub-activity details"
      >
        <Eye className="h-3 w-3 mr-1" />
        View
      </button>
      {isUserPlanner && (
        <>
          <button
            onClick={() => handleEditSubActivity(activity, subActivity)}
            className="text-xs text-blue-600 hover:text-blue-800 flex items-center p-1 rounded hover:bg-blue-50"
            title="Edit sub-activity"
          >
            <Edit className="h-3 w-3 mr-1" />
            Edit
          </button>
          <button
            onClick={(e) => handleDeleteSubActivity(subActivity.id, subActivity.name, e)}
            disabled={deleteSubActivityMutation.isPending}
            className="text-xs text-red-600 hover:text-red-800 flex items-center p-1 rounded hover:bg-red-50 disabled:opacity-50"
            title="Delete sub-activity"
          >
            {deleteSubActivityMutation.isPending ? (
              <Loader className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <Trash2 className="h-3 w-3 mr-1" />
            )}
            Delete
          </button>
        </>
      )}
    </div>
  </div>
  {subActivity.description && (
    <p className="text-xs text-gray-600 mb-2">{subActivity.description}</p>
  )}
  <div className="grid grid-cols-2 gap-2 text-xs">
    <div>Budget: ETB {subCost.toLocaleString()}</div>
    <div>Available: ETB {subFunding.toLocaleString()}</div>
    {subGap > 0 && (
      <div className="text-red-600 col-span-2">
        Gap: ETB {subGap.toLocaleString()}
      </div>
    )}
  </div>
</div>
                    );
                  })
                ) : (
                  <div className="text-center text-sm text-gray-500">No sub-activities found</div>
                )}
                {isUserPlanner && (
                  <button
                    onClick={(e) => handleAddSubActivity(activity, e)}
                    className="mt-3 w-full py-2 px-3 border border-dashed border-gray-300 rounded-md text-sm text-gray-600 hover:border-gray-400 hover:text-gray-700 flex items-center justify-center"
                    title="Add new sub-activity"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Sub-Activity
                  </button>
                )}
              </div>
              {budgetRequired > 0 && (
                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div className="text-center">
                      <div className="text-blue-600 font-medium">Required</div>
                      <div className="text-blue-800 font-bold">ETB {budgetRequired.toLocaleString()}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-blue-600 font-medium">Available</div>
                      <div className="text-blue-800 font-bold">ETB {totalFunding.toLocaleString()}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-blue-600 font-medium">Gap</div>
                      <div className={`font-bold ${fundingGap > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        ETB {fundingGap.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div className="flex justify-end mt-3">
                {isUserPlanner ? (
                  <div className="flex space-x-2">
                    {onViewActivityBudget && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onViewActivityBudget(activity); }}
                        className="text-xs text-gray-600 hover:text-gray-800 flex items-center"
                        title="View activity budget"
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View Budget
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); onEditActivity(activity); }}
                      className="text-xs text-orange-600 hover:text-orange-800 flex items-center"
                      title="Edit activity"
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      Edit
                    </button>
                    <button
                      onClick={(e) => handleDeleteActivity(activity.id, activity.name, e)}
                      disabled={deleteActivityMutation.isPending}
                      className="text-xs text-red-600 hover:text-red-800 flex items-center disabled:opacity-50"
                      title="Delete activity"
                    >
                      {deleteActivityMutation.isPending ? <Loader className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
                      Delete
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-gray-500 flex items-center">
                    <Lock className="h-3 w-3 mr-1" />
                    Read Only
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {isUserPlanner && (
        <div className="mt-4 text-center">
          <button
            onClick={() => onEditActivity({} as MainActivity)}
            disabled={remainingWeight <= 0}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50"
            title="Create new main activity"
          >
            <PlusCircle className="h-4 w-4 mr-2" />
            Create Main Activity
          </button>
        </div>
      )}
    </div>
  );
};

export default MainActivityList;