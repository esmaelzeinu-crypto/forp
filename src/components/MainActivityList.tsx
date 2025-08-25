              )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add main activity button */}
      {isUserPlanner && (
        <div className="mt-4 text-center">
          <button
            onClick={() => onEditActivity({ organization: userOrgId } as MainActivity)}
            disabled={remainingWeight <= 0}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <PlusCircle className="h-4 w-4 mr-2" />
            {displayActivities.length === 0 ? 'Create First Main Activity' :
             remainingWeight <= 0 ? `No Weight Available (${remainingWeight.toFixed(1)}%)` :
             'Create New Main Activity'}
          </button>
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
                        ${selectedSubActivity.budget_calculation_type === 'WITH_TOOL'
                          ? Number(selectedSubActivity.estimated_cost_with_tool || 0).toLocaleString()
                          : Number(selectedSubActivity.estimated_cost_without_tool || 0).toLocaleString()
                        }
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Total Funding</label>
                      <p className="text-lg font-semibold text-blue-600">
                        ${(
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
                      <span>${Number(selectedSubActivity.government_treasury || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">SDG Funding:</span>
                      <span>${Number(selectedSubActivity.sdg_funding || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Partners Funding:</span>
                      <span>${Number(selectedSubActivity.partners_funding || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Other Funding:</span>
                      <span>${Number(selectedSubActivity.other_funding || 0).toLocaleString()}</span>
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
    </div>
  );
};

export default MainActivityList;