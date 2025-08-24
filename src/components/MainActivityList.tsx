import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mainActivities, auth, api } from '../lib/api';
import { BarChart3, AlertCircle, CheckCircle, Edit, Trash2, Lock, PlusCircle, Info, Loader, DollarSign, Plus, Eye, Calculator } from 'lucide-react';
import { useLanguage } from '../lib/i18n/LanguageContext';
import type { MainActivity } from '../types/plan';
import { isPlanner } from '../types/user';

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
  training_details?: any;
  meeting_workshop_details?: any;
  procurement_details?: any;
  printing_details?: any;
  supervision_details?: any;
  partners_details?: any;
}

interface MainActivityListProps {
  initiativeId: string;
  initiativeWeight: number;
  onEditActivity: (activity: MainActivity) => void;
  onSelectActivity?: (activity: MainActivity) => void;
  onAddSubActivity?: (activity: MainActivity) => void;
  onViewActivityBudget?: (activity: MainActivity) => void;
  onEditSubActivityBudget?: (subActivity: SubActivity, activity: MainActivity) => void;
  onViewSubActivity?: (subActivity: SubActivity, activity: MainActivity) => void;
  onOpenCostingTool?: (activityType: string, activity: MainActivity, subActivity?: SubActivity) => void;
  isNewPlan?: boolean;
  planKey?: string;
}

const MainActivityList: React.FC<MainActivityListProps> = ({
  initiativeId,
  initiativeWeight,
  onEditActivity,
  onSelectActivity,
  onAddSubActivity,
  onViewActivityBudget,
  onEditSubActivityBudget,
  onViewSubActivity,
  onOpenCostingTool,
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
  const [selectedSubActivity, setSelectedSubActivity] = useState<SubActivity | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<MainActivity | null>(null);
  const [showSubActivityModal, setShowSubActivityModal] = useState(false);
  const [modalMode, setModalMode] = useState<'view' | 'edit' | 'add'>('view');

  // Log props for debugging
  console.log('MainActivityList props:', {
    initiativeId,
    initiativeWeight,
    onViewSubActivity: !!onViewSubActivity,
    onAddSubActivity: !!onAddSubActivity,
    onEditSubActivityBudget: !!onEditSubActivityBudget,
    onOpenCostingTool: !!onOpenCostingTool,
    isUserPlanner,
  });

  // Fetch user permissions
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const authData = await auth.getCurrentUser();
        const plannerStatus = isPlanner(authData.userOrganizations);
        console.log('User auth data:', authData, 'isPlanner:', plannerStatus);
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
      return await api.delete(`/main-activities/${activityId}/`);
    },
    onMutate: async (activityId) => {
      await queryClient.cancelQueries({ queryKey: ['main-activities', initiativeId] });
      const previousActivities = queryClient.getQueryData(['main-activities', initiativeId, planKey]);
      if (previousActivities?.data) {
        queryClient.setQueryData(['main-activities', initiativeId, planKey], {
          ...previousActivities,
          data: previousActivities.data.filter((activity: any) => activity.id !== activityId),
        });
      }
      return { previousActivities };
    },
    onError: (err: any, _, context) => {
      console.error('Failed to delete activity:', err);
      if (context?.previousActivities) {
        queryClient.setQueryData(['main-activities', initiativeId, planKey], context.previousActivities);
      }
      setActionError(err.response?.data?.detail || 'Failed to delete activity.');
      setTimeout(() => setActionError(null), 5000);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['main-activities', initiativeId] });
      queryClient.invalidateQueries({ queryKey: ['initiatives'] });
      refetch();
    },
  });

  // Delete sub-activity mutation
  const deleteSubActivityMutation = useMutation({
    mutationFn: async (subActivityId: string) => {
      console.log(`Deleting sub-activity: ${subActivityId}`);
      return await api.delete(`/sub-activities/${subActivityId}/`);
    },
    onError: (err: any) => {
      console.error('Failed to delete sub-activity:', err);
      setActionError(err.response?.data?.detail || 'Failed to delete sub-activity.');
      setTimeout(() => setActionError(null), 5000);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['main-activities', initiativeId] });
      refetch();
    },
  });

  // Filter activities by organization
  const filteredActivities = React.useMemo(() => {
    if (!activitiesList?.data || !userOrgId) return [];
    const activities = activitiesList.data.filter((activity: any) => {
      const shouldInclude = !activity.organization || Number(activity.organization) === Number(userOrgId);
      console.log(`Activity "${activity.name}" - org:${activity.organization}, userOrg:${userOrgId}, include:${shouldInclude}`);
      return shouldInclude;
    });
    console.log('Filtered activities:', activities);
    return activities;
  }, [activitiesList?.data, userOrgId]);

  // Calculate weights
  const { totalActivitiesWeight, maxAllowedWeight, remainingWeight, isWeightValid } = React.useMemo(() => {
    try {
      const totalWeight = filteredActivities.reduce((sum: number, activity: any) => sum + (Number(activity.weight) || 0), 0);
      const maxAllowed = Number(initiativeWeight) * 0.65;
      const remaining = maxAllowed - totalWeight;
      const isValid = totalWeight <= maxAllowed;
      console.log('Weight calculation:', { totalWeight, maxAllowed, remaining, isValid });
      return { totalActivitiesWeight: totalWeight, maxAllowedWeight: maxAllowed, remainingWeight: remaining, isWeightValid: isValid };
    } catch (error) {
      console.error('Error calculating weights:', error);
      setActionError('Failed to calculate weights.');
      setTimeout(() => setActionError(null), 5000);
      return { totalActivitiesWeight: 0, maxAllowedWeight: 0, remainingWeight: 0, isWeightValid: true };
    }
  }, [filteredActivities, initiativeWeight]);

  // Enhanced handlers with proper modal management
  const handleDeleteActivity = async (activityId: string, activityName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Delete "${activityName}" and all its sub-activities? This action cannot be undone.`)) {
      await deleteActivityMutation.mutateAsync(activityId);
    }
  };

  const handleDeleteSubActivity = async (subActivityId: string, subActivityName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Delete sub-activity "${subActivityName}"? This action cannot be undone.`)) {
      await deleteSubActivityMutation.mutateAsync(subActivityId);
    }
  };

  const handleViewSubActivity = (subActivity: SubActivity, activity: MainActivity, e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('Opening view modal for sub-activity:', subActivity.id);
    
    if (onViewSubActivity) {
      // Use the provided callback
      onViewSubActivity(subActivity, activity);
    } else {
      // Fallback: open internal modal
      setSelectedSubActivity(subActivity);
      setSelectedActivity(activity);
      setModalMode('view');
      setShowSubActivityModal(true);
    }
  };

  const handleEditSubActivityBudget = (subActivity: SubActivity, activity: MainActivity, e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('Opening edit modal for sub-activity budget:', subActivity.id);
    
    if (onEditSubActivityBudget) {
      // Use the provided callback
      onEditSubActivityBudget(subActivity, activity);
    } else if (onOpenCostingTool) {
      // Open costing tool for editing
      onOpenCostingTool(subActivity.activity_type, activity, subActivity);
    } else {
      // Fallback: open internal modal
      setSelectedSubActivity(subActivity);
      setSelectedActivity(activity);
      setModalMode('edit');
      setShowSubActivityModal(true);
    }
  };

  const handleAddSubActivity = (activity: MainActivity, e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('Opening add sub-activity modal for activity:', activity.id);
    
    if (onAddSubActivity) {
      // Use the provided callback
      onAddSubActivity(activity);
    } else {
      // Fallback: open internal modal
      setSelectedActivity(activity);
      setSelectedSubActivity(null);
      setModalMode('add');
      setShowSubActivityModal(true);
    }
  };

  const handleOpenCostingTool = (activityType: string, activity: MainActivity, subActivity?: SubActivity) => {
    console.log('Opening costing tool:', { activityType, activityId: activity.id, subActivityId: subActivity?.id });
    
    if (onOpenCostingTool) {
      onOpenCostingTool(activityType, activity, subActivity);
    } else {
      // Fallback: show activity type selection modal
      setSelectedActivity(activity);
      setSelectedSubActivity(subActivity || null);
      setModalMode('add');
      setShowSubActivityModal(true);
    }
  };

  const handleValidateActivities = () => {
    if (isWeightValid) {
      setValidationSuccess(`Weights valid (${totalActivitiesWeight.toFixed(1)}% ≤ ${maxAllowedWeight.toFixed(1)}%)`);
      setTimeout(() => setValidationSuccess(null), 3000);
    } else {
      setValidationError(`Weights exceed limit (${totalActivitiesWeight.toFixed(1)}% > ${maxAllowedWeight.toFixed(1)}%)`);
      setTimeout(() => setValidationError(null), 5000);
    }
  };

  const closeModal = () => {
    setShowSubActivityModal(false);
    setSelectedSubActivity(null);
    setSelectedActivity(null);
    setModalMode('view');
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
                <h4 className="font-medium text-gray-900">{activity.name}</h4>
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

              {/* Sub-Activities Container */}
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
                  <div className="space-y-2">
                    {activity.sub_activities.map((subActivity: SubActivity) => {
                      const subCost = subActivity.budget_calculation_type === 'WITH_TOOL'
                        ? Number(subActivity.estimated_cost_with_tool || 0)
                        : Number(subActivity.estimated_cost_without_tool || 0);
                      const subFunding = Number(subActivity.government_treasury || 0) +
                                        Number(subActivity.sdg_funding || 0) +
                                        Number(subActivity.partners_funding || 0) +
                                        Number(subActivity.other_funding || 0);
                      const subGap = Math.max(0, subCost - subFunding);

                      return (
                        <div key={subActivity.id} className="bg-white p-3 rounded border border-gray-200">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center flex-1">
                              <span className="text-sm font-medium text-gray-900">{subActivity.name}</span>
                              <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full">
                                {subActivity.activity_type}
                              </span>
                              {subActivity.budget_calculation_type === 'WITH_TOOL' && (
                                <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded-full">
                                  Tool Calculated
                                </span>
                              )}
                            </div>
                            
                            {isUserPlanner && (
                              <div className="flex items-center space-x-1">
                                <button
                                  onClick={(e) => handleViewSubActivity(subActivity, activity, e)}
                                  className="text-xs text-blue-600 hover:text-blue-800 flex items-center p-1 rounded hover:bg-blue-50"
                                  title="View sub-activity details"
                                >
                                  <Eye className="h-3 w-3 mr-1" />
                                  View
                                </button>
                                
                                <button
                                  onClick={(e) => handleEditSubActivityBudget(subActivity, activity, e)}
                                  className="text-xs text-green-600 hover:text-green-800 flex items-center p-1 rounded hover:bg-green-50"
                                  title="Edit sub-activity budget"
                                >
                                  <Calculator className="h-3 w-3 mr-1" />
                                  Edit Budget
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
                              </div>
                            )}
                          </div>
                          
                          {subActivity.description && (
                            <p className="text-xs text-gray-600 mb-2">{subActivity.description}</p>
                          )}
                          
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>Budget: ETB {subCost.toLocaleString()}</div>
                            <div>Available: ETB {subFunding.toLocaleString()}</div>
                            {subGap > 0 && (
                              <div className="text-red-600 col-span-2">Gap: ETB {subGap.toLocaleString()}</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center text-sm text-gray-500 py-4">
                    No sub-activities found for this main activity
                  </div>
                )}

                {isUserPlanner && (
                  <button
                    onClick={(e) => handleAddSubActivity(activity, e)}
                    className="mt-3 w-full py-2 px-3 border border-dashed border-gray-300 rounded-md text-sm text-gray-600 hover:border-gray-400 hover:text-gray-700 flex items-center justify-center transition-colors"
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
                      {deleteActivityMutation.isPending ? (
                        <Loader className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 mr-1" />
                      )}
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

      {/* Sub-Activity Modal */}
      {showSubActivityModal && selectedActivity && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                {modalMode === 'add' ? 'Add Sub-Activity' : 
                 modalMode === 'edit' ? 'Edit Sub-Activity Budget' : 
                 'Sub-Activity Details'}
              </h3>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-500"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {modalMode === 'view' && selectedSubActivity && (
              <div className="space-y-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-2">{selectedSubActivity.name}</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Type:</span>
                      <span className="ml-2 font-medium">{selectedSubActivity.activity_type}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Budget Type:</span>
                      <span className="ml-2 font-medium">{selectedSubActivity.budget_calculation_type}</span>
                    </div>
                  </div>
                  {selectedSubActivity.description && (
                    <p className="text-sm text-gray-600 mt-2">{selectedSubActivity.description}</p>
                  )}
                </div>

                <div className="bg-blue-50 p-4 rounded-lg">
                  <h5 className="font-medium text-blue-800 mb-2">Budget Details</h5>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-blue-600">Estimated Cost:</span>
                      <span className="ml-2 font-medium">
                        ETB {(selectedSubActivity.budget_calculation_type === 'WITH_TOOL' 
                          ? Number(selectedSubActivity.estimated_cost_with_tool || 0)
                          : Number(selectedSubActivity.estimated_cost_without_tool || 0)
                        ).toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-blue-600">Government:</span>
                      <span className="ml-2 font-medium">ETB {Number(selectedSubActivity.government_treasury || 0).toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-blue-600">SDG Funding:</span>
                      <span className="ml-2 font-medium">ETB {Number(selectedSubActivity.sdg_funding || 0).toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-blue-600">Partners:</span>
                      <span className="ml-2 font-medium">ETB {Number(selectedSubActivity.partners_funding || 0).toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-blue-600">Other:</span>
                      <span className="ml-2 font-medium">ETB {Number(selectedSubActivity.other_funding || 0).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end space-x-2">
                  <button
                    onClick={() => {
                      setModalMode('edit');
                    }}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                  >
                    Edit Budget
                  </button>
                  <button
                    onClick={closeModal}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

            {modalMode === 'add' && (
              <div className="space-y-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h4 className="font-medium text-blue-800 mb-2">Select Activity Type</h4>
                  <p className="text-sm text-blue-600 mb-4">Choose the type of sub-activity to add to "{selectedActivity.name}"</p>
                  
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {['Training', 'Meeting', 'Workshop', 'Printing', 'Supervision', 'Procurement', 'Other'].map(type => (
                      <button
                        key={type}
                        onClick={() => handleOpenCostingTool(type, selectedActivity)}
                        className="p-3 text-sm border border-gray-300 rounded-md hover:border-blue-500 hover:bg-blue-50 transition-colors"
                      >
                        <Calculator className="h-4 w-4 mx-auto mb-1" />
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="flex justify-end">
                  <button
                    onClick={closeModal}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {modalMode === 'edit' && selectedSubActivity && (
              <div className="space-y-4">
                <div className="bg-green-50 p-4 rounded-lg">
                  <h4 className="font-medium text-green-800 mb-2">Edit Budget for "{selectedSubActivity.name}"</h4>
                  <p className="text-sm text-green-600 mb-4">
                    Current Type: {selectedSubActivity.activity_type} | 
                    Budget Method: {selectedSubActivity.budget_calculation_type}
                  </p>
                  
                  <div className="flex space-x-3">
                    <button
                      onClick={() => handleOpenCostingTool(selectedSubActivity.activity_type, selectedActivity, selectedSubActivity)}
                      className="flex-1 p-3 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center justify-center"
                    >
                      <Calculator className="h-4 w-4 mr-2" />
                      Open {selectedSubActivity.activity_type} Costing Tool
                    </button>
                  </div>
                </div>
                
                <div className="flex justify-end space-x-2">
                  <button
                    onClick={closeModal}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MainActivityList;