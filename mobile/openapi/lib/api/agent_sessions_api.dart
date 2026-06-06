//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;


class AgentSessionsApi {
  AgentSessionsApi([ApiClient? apiClient]) : apiClient = apiClient ?? defaultApiClient;

  final ApiClient apiClient;

  /// Append an agent session message
  ///
  /// Append a user-authored message to an AI agent session owned by the current user.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentMessageCreateDto] agentMessageCreateDto (required):
  Future<Response> appendAgentSessionMessageWithHttpInfo(String id, AgentMessageCreateDto agentMessageCreateDto,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/sessions/{id}/messages'
      .replaceAll('{id}', id);

    // ignore: prefer_final_locals
    Object? postBody = agentMessageCreateDto;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>['application/json'];


    return apiClient.invokeAPI(
      apiPath,
      'POST',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Append an agent session message
  ///
  /// Append a user-authored message to an AI agent session owned by the current user.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentMessageCreateDto] agentMessageCreateDto (required):
  Future<AgentMessageResponseDto?> appendAgentSessionMessage(String id, AgentMessageCreateDto agentMessageCreateDto,) async {
    final response = await appendAgentSessionMessageWithHttpInfo(id, agentMessageCreateDto,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'AgentMessageResponseDto',) as AgentMessageResponseDto;
    
    }
    return null;
  }

  /// Apply approved agent album operations
  ///
  /// Apply selected album operations from the current proposed agent operation plan.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [String] planId (required):
  ///
  /// * [AgentOperationPlanApplyRequestDto] agentOperationPlanApplyRequestDto (required):
  Future<Response> applyApprovedOperationsWithHttpInfo(String id, String planId, AgentOperationPlanApplyRequestDto agentOperationPlanApplyRequestDto,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/sessions/{id}/operation-plan/{planId}/apply'
      .replaceAll('{id}', id)
      .replaceAll('{planId}', planId);

    // ignore: prefer_final_locals
    Object? postBody = agentOperationPlanApplyRequestDto;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>['application/json'];


    return apiClient.invokeAPI(
      apiPath,
      'POST',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Apply approved agent album operations
  ///
  /// Apply selected album operations from the current proposed agent operation plan.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [String] planId (required):
  ///
  /// * [AgentOperationPlanApplyRequestDto] agentOperationPlanApplyRequestDto (required):
  Future<AgentOperationPlanApplyResponseDto?> applyApprovedOperations(String id, String planId, AgentOperationPlanApplyRequestDto agentOperationPlanApplyRequestDto,) async {
    final response = await applyApprovedOperationsWithHttpInfo(id, planId, agentOperationPlanApplyRequestDto,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'AgentOperationPlanApplyResponseDto',) as AgentOperationPlanApplyResponseDto;
    
    }
    return null;
  }

  /// Approve or deny an agent tool call
  ///
  /// Record an explicit user approval decision for a pending internal agent tool call.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [String] toolCallId (required):
  ///
  /// * [AgentToolApprovalDto] agentToolApprovalDto (required):
  Future<Response> approveToolCallWithHttpInfo(String id, String toolCallId, AgentToolApprovalDto agentToolApprovalDto,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/sessions/{id}/tool-calls/{toolCallId}/approval'
      .replaceAll('{id}', id)
      .replaceAll('{toolCallId}', toolCallId);

    // ignore: prefer_final_locals
    Object? postBody = agentToolApprovalDto;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>['application/json'];


    return apiClient.invokeAPI(
      apiPath,
      'POST',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Approve or deny an agent tool call
  ///
  /// Record an explicit user approval decision for a pending internal agent tool call.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [String] toolCallId (required):
  ///
  /// * [AgentToolApprovalDto] agentToolApprovalDto (required):
  Future<AgentToolCallResponseDto?> approveToolCall(String id, String toolCallId, AgentToolApprovalDto agentToolApprovalDto,) async {
    final response = await approveToolCallWithHttpInfo(id, toolCallId, agentToolApprovalDto,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'AgentToolCallResponseDto',) as AgentToolCallResponseDto;
    
    }
    return null;
  }

  /// Cancel an agent session
  ///
  /// Cancel an active AI agent session owned by the current user.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  Future<Response> cancelAgentSessionWithHttpInfo(String id,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/sessions/{id}/cancel'
      .replaceAll('{id}', id);

    // ignore: prefer_final_locals
    Object? postBody;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>[];


    return apiClient.invokeAPI(
      apiPath,
      'POST',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Cancel an agent session
  ///
  /// Cancel an active AI agent session owned by the current user.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  Future<AgentSessionResponseDto?> cancelAgentSession(String id,) async {
    final response = await cancelAgentSessionWithHttpInfo(id,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'AgentSessionResponseDto',) as AgentSessionResponseDto;
    
    }
    return null;
  }

  /// Create an agent session
  ///
  /// Create a personal AI agent session with immutable credential, model, permission plan, and approval mode snapshots.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [AgentSessionCreateDto] agentSessionCreateDto (required):
  Future<Response> createAgentSessionWithHttpInfo(AgentSessionCreateDto agentSessionCreateDto,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/sessions';

    // ignore: prefer_final_locals
    Object? postBody = agentSessionCreateDto;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>['application/json'];


    return apiClient.invokeAPI(
      apiPath,
      'POST',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Create an agent session
  ///
  /// Create a personal AI agent session with immutable credential, model, permission plan, and approval mode snapshots.
  ///
  /// Parameters:
  ///
  /// * [AgentSessionCreateDto] agentSessionCreateDto (required):
  Future<AgentSessionResponseDto?> createAgentSession(AgentSessionCreateDto agentSessionCreateDto,) async {
    final response = await createAgentSessionWithHttpInfo(agentSessionCreateDto,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'AgentSessionResponseDto',) as AgentSessionResponseDto;
    
    }
    return null;
  }

  /// Delete an agent session
  ///
  /// Delete an AI agent session owned by the current user.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  Future<Response> deleteAgentSessionWithHttpInfo(String id,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/sessions/{id}'
      .replaceAll('{id}', id);

    // ignore: prefer_final_locals
    Object? postBody;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>[];


    return apiClient.invokeAPI(
      apiPath,
      'DELETE',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Delete an agent session
  ///
  /// Delete an AI agent session owned by the current user.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  Future<void> deleteAgentSession(String id,) async {
    final response = await deleteAgentSessionWithHttpInfo(id,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
  }

  /// Execute the internal searchAssets agent tool
  ///
  /// Internal route for requesting or resuming a strict-approved asset search tool call for an AI agent session.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentSearchAssetsToolRequestDto] agentSearchAssetsToolRequestDto (required):
  Future<Response> executeAgentSearchAssetsWithHttpInfo(String id, AgentSearchAssetsToolRequestDto agentSearchAssetsToolRequestDto,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/sessions/{id}/tools/search-assets'
      .replaceAll('{id}', id);

    // ignore: prefer_final_locals
    Object? postBody = agentSearchAssetsToolRequestDto;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>['application/json'];


    return apiClient.invokeAPI(
      apiPath,
      'POST',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Execute the internal searchAssets agent tool
  ///
  /// Internal route for requesting or resuming a strict-approved asset search tool call for an AI agent session.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentSearchAssetsToolRequestDto] agentSearchAssetsToolRequestDto (required):
  Future<AgentSearchAssetsToolResponseDto?> executeAgentSearchAssets(String id, AgentSearchAssetsToolRequestDto agentSearchAssetsToolRequestDto,) async {
    final response = await executeAgentSearchAssetsWithHttpInfo(id, agentSearchAssetsToolRequestDto,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'AgentSearchAssetsToolResponseDto',) as AgentSearchAssetsToolResponseDto;
    
    }
    return null;
  }

  /// Execute the internal findTripCandidates agent tool
  ///
  /// Internal route for requesting or resuming a strict-approved trip candidate lookup tool call for an AI agent session.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentFindTripCandidatesToolRequestDto] agentFindTripCandidatesToolRequestDto (required):
  Future<Response> findTripCandidatesWithHttpInfo(String id, AgentFindTripCandidatesToolRequestDto agentFindTripCandidatesToolRequestDto,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/sessions/{id}/tools/find-trip-candidates'
      .replaceAll('{id}', id);

    // ignore: prefer_final_locals
    Object? postBody = agentFindTripCandidatesToolRequestDto;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>['application/json'];


    return apiClient.invokeAPI(
      apiPath,
      'POST',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Execute the internal findTripCandidates agent tool
  ///
  /// Internal route for requesting or resuming a strict-approved trip candidate lookup tool call for an AI agent session.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentFindTripCandidatesToolRequestDto] agentFindTripCandidatesToolRequestDto (required):
  Future<AgentFindTripCandidatesToolResponseDto?> findTripCandidates(String id, AgentFindTripCandidatesToolRequestDto agentFindTripCandidatesToolRequestDto,) async {
    final response = await findTripCandidatesWithHttpInfo(id, agentFindTripCandidatesToolRequestDto,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'AgentFindTripCandidatesToolResponseDto',) as AgentFindTripCandidatesToolResponseDto;
    
    }
    return null;
  }

  /// Retrieve an agent session
  ///
  /// Retrieve an AI agent session by ID. The current user must own this session.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  Future<Response> getAgentSessionWithHttpInfo(String id,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/sessions/{id}'
      .replaceAll('{id}', id);

    // ignore: prefer_final_locals
    Object? postBody;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>[];


    return apiClient.invokeAPI(
      apiPath,
      'GET',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Retrieve an agent session
  ///
  /// Retrieve an AI agent session by ID. The current user must own this session.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  Future<AgentSessionResponseDto?> getAgentSession(String id,) async {
    final response = await getAgentSessionWithHttpInfo(id,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'AgentSessionResponseDto',) as AgentSessionResponseDto;
    
    }
    return null;
  }

  /// List agent session activity events
  ///
  /// Retrieve persisted activity events for an AI agent session owned by the current user.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  Future<Response> getAgentSessionActivityEventsWithHttpInfo(String id,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/sessions/{id}/activity-events'
      .replaceAll('{id}', id);

    // ignore: prefer_final_locals
    Object? postBody;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>[];


    return apiClient.invokeAPI(
      apiPath,
      'GET',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// List agent session activity events
  ///
  /// Retrieve persisted activity events for an AI agent session owned by the current user.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  Future<List<AgentSessionActivityEventResponseDto>?> getAgentSessionActivityEvents(String id,) async {
    final response = await getAgentSessionActivityEventsWithHttpInfo(id,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      final responseBody = await _decodeBodyBytes(response);
      return (await apiClient.deserializeAsync(responseBody, 'List<AgentSessionActivityEventResponseDto>') as List)
        .cast<AgentSessionActivityEventResponseDto>()
        .toList(growable: false);

    }
    return null;
  }

  /// List agent session messages
  ///
  /// Retrieve persisted chat messages for an AI agent session owned by the current user.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  Future<Response> getAgentSessionMessagesWithHttpInfo(String id,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/sessions/{id}/messages'
      .replaceAll('{id}', id);

    // ignore: prefer_final_locals
    Object? postBody;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>[];


    return apiClient.invokeAPI(
      apiPath,
      'GET',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// List agent session messages
  ///
  /// Retrieve persisted chat messages for an AI agent session owned by the current user.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  Future<List<AgentMessageResponseDto>?> getAgentSessionMessages(String id,) async {
    final response = await getAgentSessionMessagesWithHttpInfo(id,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      final responseBody = await _decodeBodyBytes(response);
      return (await apiClient.deserializeAsync(responseBody, 'List<AgentMessageResponseDto>') as List)
        .cast<AgentMessageResponseDto>()
        .toList(growable: false);

    }
    return null;
  }

  /// List agent sessions
  ///
  /// Retrieve all AI agent sessions owned by the current user.
  ///
  /// Note: This method returns the HTTP [Response].
  Future<Response> getAgentSessionsWithHttpInfo() async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/sessions';

    // ignore: prefer_final_locals
    Object? postBody;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>[];


    return apiClient.invokeAPI(
      apiPath,
      'GET',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// List agent sessions
  ///
  /// Retrieve all AI agent sessions owned by the current user.
  Future<List<AgentSessionResponseDto>?> getAgentSessions() async {
    final response = await getAgentSessionsWithHttpInfo();
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      final responseBody = await _decodeBodyBytes(response);
      return (await apiClient.deserializeAsync(responseBody, 'List<AgentSessionResponseDto>') as List)
        .cast<AgentSessionResponseDto>()
        .toList(growable: false);

    }
    return null;
  }

  /// Get applied agent operation plans
  ///
  /// Get applied album operation plan history for an AI agent session owned by the current user.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  Future<Response> getAppliedOperationPlansWithHttpInfo(String id,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/sessions/{id}/operation-plan/applied'
      .replaceAll('{id}', id);

    // ignore: prefer_final_locals
    Object? postBody;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>[];


    return apiClient.invokeAPI(
      apiPath,
      'GET',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Get applied agent operation plans
  ///
  /// Get applied album operation plan history for an AI agent session owned by the current user.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  Future<List<AgentOperationPlanResponseDto>?> getAppliedOperationPlans(String id,) async {
    final response = await getAppliedOperationPlansWithHttpInfo(id,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      final responseBody = await _decodeBodyBytes(response);
      return (await apiClient.deserializeAsync(responseBody, 'List<AgentOperationPlanResponseDto>') as List)
        .cast<AgentOperationPlanResponseDto>()
        .toList(growable: false);

    }
    return null;
  }

  /// Get the current agent operation plan
  ///
  /// Get the current proposed album operation plan for an AI agent session owned by the current user.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  Future<Response> getCurrentOperationPlanWithHttpInfo(String id,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/sessions/{id}/operation-plan'
      .replaceAll('{id}', id);

    // ignore: prefer_final_locals
    Object? postBody;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>[];


    return apiClient.invokeAPI(
      apiPath,
      'GET',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Get the current agent operation plan
  ///
  /// Get the current proposed album operation plan for an AI agent session owned by the current user.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  Future<AgentOperationPlanResponseDto?> getCurrentOperationPlan(String id,) async {
    final response = await getCurrentOperationPlanWithHttpInfo(id,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'AgentOperationPlanResponseDto',) as AgentOperationPlanResponseDto;
    
    }
    return null;
  }

  /// List agent tool calls
  ///
  /// List audited internal tool calls for an AI agent session owned by the current user.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  Future<Response> getToolCallsWithHttpInfo(String id,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/sessions/{id}/tool-calls'
      .replaceAll('{id}', id);

    // ignore: prefer_final_locals
    Object? postBody;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>[];


    return apiClient.invokeAPI(
      apiPath,
      'GET',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// List agent tool calls
  ///
  /// List audited internal tool calls for an AI agent session owned by the current user.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  Future<List<AgentToolCallResponseDto>?> getToolCalls(String id,) async {
    final response = await getToolCallsWithHttpInfo(id,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      final responseBody = await _decodeBodyBytes(response);
      return (await apiClient.deserializeAsync(responseBody, 'List<AgentToolCallResponseDto>') as List)
        .cast<AgentToolCallResponseDto>()
        .toList(growable: false);

    }
    return null;
  }

  /// Handle the internal runner MCP endpoint
  ///
  /// Internal runner MCP endpoint for a first-party Pi agent session.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  Future<Response> handleWithHttpInfo(String id,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/internal/mcp/sessions/{id}'
      .replaceAll('{id}', id);

    // ignore: prefer_final_locals
    Object? postBody;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>[];


    return apiClient.invokeAPI(
      apiPath,
      'POST',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Handle the internal runner MCP endpoint
  ///
  /// Internal runner MCP endpoint for a first-party Pi agent session.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  Future<void> handle(String id,) async {
    final response = await handleWithHttpInfo(id,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
  }

  /// Execute the internal listAlbums agent tool
  ///
  /// Internal route for requesting or resuming a strict-approved album list tool call for an AI agent session.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentListAlbumsToolRequestDto] agentListAlbumsToolRequestDto (required):
  Future<Response> listAlbumsWithHttpInfo(String id, AgentListAlbumsToolRequestDto agentListAlbumsToolRequestDto,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/sessions/{id}/tools/list-albums'
      .replaceAll('{id}', id);

    // ignore: prefer_final_locals
    Object? postBody = agentListAlbumsToolRequestDto;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>['application/json'];


    return apiClient.invokeAPI(
      apiPath,
      'POST',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Execute the internal listAlbums agent tool
  ///
  /// Internal route for requesting or resuming a strict-approved album list tool call for an AI agent session.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentListAlbumsToolRequestDto] agentListAlbumsToolRequestDto (required):
  Future<AgentListAlbumsToolResponseDto?> listAlbums(String id, AgentListAlbumsToolRequestDto agentListAlbumsToolRequestDto,) async {
    final response = await listAlbumsWithHttpInfo(id, agentListAlbumsToolRequestDto,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'AgentListAlbumsToolResponseDto',) as AgentListAlbumsToolResponseDto;
    
    }
    return null;
  }

  /// Execute the internal listDuplicateGroups agent tool
  ///
  /// Internal route for requesting or resuming a strict-approved duplicate group list tool call for an AI agent session.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentListDuplicateGroupsToolRequestDto] agentListDuplicateGroupsToolRequestDto (required):
  Future<Response> listDuplicateGroupsWithHttpInfo(String id, AgentListDuplicateGroupsToolRequestDto agentListDuplicateGroupsToolRequestDto,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/sessions/{id}/tools/list-duplicate-groups'
      .replaceAll('{id}', id);

    // ignore: prefer_final_locals
    Object? postBody = agentListDuplicateGroupsToolRequestDto;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>['application/json'];


    return apiClient.invokeAPI(
      apiPath,
      'POST',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Execute the internal listDuplicateGroups agent tool
  ///
  /// Internal route for requesting or resuming a strict-approved duplicate group list tool call for an AI agent session.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentListDuplicateGroupsToolRequestDto] agentListDuplicateGroupsToolRequestDto (required):
  Future<AgentListDuplicateGroupsToolResponseDto?> listDuplicateGroups(String id, AgentListDuplicateGroupsToolRequestDto agentListDuplicateGroupsToolRequestDto,) async {
    final response = await listDuplicateGroupsWithHttpInfo(id, agentListDuplicateGroupsToolRequestDto,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'AgentListDuplicateGroupsToolResponseDto',) as AgentListDuplicateGroupsToolResponseDto;
    
    }
    return null;
  }

  /// Execute the internal listSpaces agent tool
  ///
  /// Internal route for requesting or resuming a strict-approved shared-space list tool call for an AI agent session.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentListSpacesToolRequestDto] agentListSpacesToolRequestDto (required):
  Future<Response> listSpacesWithHttpInfo(String id, AgentListSpacesToolRequestDto agentListSpacesToolRequestDto,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/sessions/{id}/tools/list-spaces'
      .replaceAll('{id}', id);

    // ignore: prefer_final_locals
    Object? postBody = agentListSpacesToolRequestDto;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>['application/json'];


    return apiClient.invokeAPI(
      apiPath,
      'POST',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Execute the internal listSpaces agent tool
  ///
  /// Internal route for requesting or resuming a strict-approved shared-space list tool call for an AI agent session.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentListSpacesToolRequestDto] agentListSpacesToolRequestDto (required):
  Future<AgentListSpacesToolResponseDto?> listSpaces(String id, AgentListSpacesToolRequestDto agentListSpacesToolRequestDto,) async {
    final response = await listSpacesWithHttpInfo(id, agentListSpacesToolRequestDto,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'AgentListSpacesToolResponseDto',) as AgentListSpacesToolResponseDto;
    
    }
    return null;
  }

  /// Propose agent album operations
  ///
  /// Internal route for storing a structured album operation proposal for an AI agent session.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentProposeAlbumOperationsDto] agentProposeAlbumOperationsDto (required):
  Future<Response> proposeAlbumOperationsWithHttpInfo(String id, AgentProposeAlbumOperationsDto agentProposeAlbumOperationsDto,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/sessions/{id}/operation-plan/proposals'
      .replaceAll('{id}', id);

    // ignore: prefer_final_locals
    Object? postBody = agentProposeAlbumOperationsDto;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>['application/json'];


    return apiClient.invokeAPI(
      apiPath,
      'POST',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Propose agent album operations
  ///
  /// Internal route for storing a structured album operation proposal for an AI agent session.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentProposeAlbumOperationsDto] agentProposeAlbumOperationsDto (required):
  Future<AgentOperationPlanToolResponseDto?> proposeAlbumOperations(String id, AgentProposeAlbumOperationsDto agentProposeAlbumOperationsDto,) async {
    final response = await proposeAlbumOperationsWithHttpInfo(id, agentProposeAlbumOperationsDto,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'AgentOperationPlanToolResponseDto',) as AgentOperationPlanToolResponseDto;
    
    }
    return null;
  }

  /// Execute the internal readAlbum agent tool
  ///
  /// Internal route for requesting or resuming a strict-approved album read tool call for an AI agent session.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentReadAlbumToolRequestDto] agentReadAlbumToolRequestDto (required):
  Future<Response> readAlbumWithHttpInfo(String id, AgentReadAlbumToolRequestDto agentReadAlbumToolRequestDto,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/sessions/{id}/tools/read-album'
      .replaceAll('{id}', id);

    // ignore: prefer_final_locals
    Object? postBody = agentReadAlbumToolRequestDto;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>['application/json'];


    return apiClient.invokeAPI(
      apiPath,
      'POST',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Execute the internal readAlbum agent tool
  ///
  /// Internal route for requesting or resuming a strict-approved album read tool call for an AI agent session.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentReadAlbumToolRequestDto] agentReadAlbumToolRequestDto (required):
  Future<AgentReadAlbumToolResponseDto?> readAlbum(String id, AgentReadAlbumToolRequestDto agentReadAlbumToolRequestDto,) async {
    final response = await readAlbumWithHttpInfo(id, agentReadAlbumToolRequestDto,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'AgentReadAlbumToolResponseDto',) as AgentReadAlbumToolResponseDto;
    
    }
    return null;
  }

  /// Execute the internal readAssetMetadata agent tool
  ///
  /// Internal route for requesting or resuming a strict-approved metadata read tool call for an AI agent session.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentReadAssetMetadataToolRequestDto] agentReadAssetMetadataToolRequestDto (required):
  Future<Response> readAssetMetadataWithHttpInfo(String id, AgentReadAssetMetadataToolRequestDto agentReadAssetMetadataToolRequestDto,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/sessions/{id}/tools/read-asset-metadata'
      .replaceAll('{id}', id);

    // ignore: prefer_final_locals
    Object? postBody = agentReadAssetMetadataToolRequestDto;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>['application/json'];


    return apiClient.invokeAPI(
      apiPath,
      'POST',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Execute the internal readAssetMetadata agent tool
  ///
  /// Internal route for requesting or resuming a strict-approved metadata read tool call for an AI agent session.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentReadAssetMetadataToolRequestDto] agentReadAssetMetadataToolRequestDto (required):
  Future<AgentReadAssetMetadataToolResponseDto?> readAssetMetadata(String id, AgentReadAssetMetadataToolRequestDto agentReadAssetMetadataToolRequestDto,) async {
    final response = await readAssetMetadataWithHttpInfo(id, agentReadAssetMetadataToolRequestDto,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'AgentReadAssetMetadataToolResponseDto',) as AgentReadAssetMetadataToolResponseDto;
    
    }
    return null;
  }

  /// Execute the internal readAssetOriginals agent tool
  ///
  /// Internal route for requesting or resuming a strict-approved original read tool call for an AI agent session.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentReadAssetOriginalsToolRequestDto] agentReadAssetOriginalsToolRequestDto (required):
  Future<Response> readAssetOriginalsWithHttpInfo(String id, AgentReadAssetOriginalsToolRequestDto agentReadAssetOriginalsToolRequestDto,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/sessions/{id}/tools/read-asset-originals'
      .replaceAll('{id}', id);

    // ignore: prefer_final_locals
    Object? postBody = agentReadAssetOriginalsToolRequestDto;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>['application/json'];


    return apiClient.invokeAPI(
      apiPath,
      'POST',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Execute the internal readAssetOriginals agent tool
  ///
  /// Internal route for requesting or resuming a strict-approved original read tool call for an AI agent session.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentReadAssetOriginalsToolRequestDto] agentReadAssetOriginalsToolRequestDto (required):
  Future<AgentReadAssetOriginalsToolResponseDto?> readAssetOriginals(String id, AgentReadAssetOriginalsToolRequestDto agentReadAssetOriginalsToolRequestDto,) async {
    final response = await readAssetOriginalsWithHttpInfo(id, agentReadAssetOriginalsToolRequestDto,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'AgentReadAssetOriginalsToolResponseDto',) as AgentReadAssetOriginalsToolResponseDto;
    
    }
    return null;
  }

  /// Execute the internal readAssetPreviews agent tool
  ///
  /// Internal route for requesting or resuming a strict-approved preview read tool call for an AI agent session.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentReadAssetPreviewsToolRequestDto] agentReadAssetPreviewsToolRequestDto (required):
  Future<Response> readAssetPreviewsWithHttpInfo(String id, AgentReadAssetPreviewsToolRequestDto agentReadAssetPreviewsToolRequestDto,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/sessions/{id}/tools/read-asset-previews'
      .replaceAll('{id}', id);

    // ignore: prefer_final_locals
    Object? postBody = agentReadAssetPreviewsToolRequestDto;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>['application/json'];


    return apiClient.invokeAPI(
      apiPath,
      'POST',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Execute the internal readAssetPreviews agent tool
  ///
  /// Internal route for requesting or resuming a strict-approved preview read tool call for an AI agent session.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentReadAssetPreviewsToolRequestDto] agentReadAssetPreviewsToolRequestDto (required):
  Future<AgentReadAssetPreviewsToolResponseDto?> readAssetPreviews(String id, AgentReadAssetPreviewsToolRequestDto agentReadAssetPreviewsToolRequestDto,) async {
    final response = await readAssetPreviewsWithHttpInfo(id, agentReadAssetPreviewsToolRequestDto,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'AgentReadAssetPreviewsToolResponseDto',) as AgentReadAssetPreviewsToolResponseDto;
    
    }
    return null;
  }

  /// Execute the internal readSpace agent tool
  ///
  /// Internal route for requesting or resuming a strict-approved shared-space read tool call for an AI agent session.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentReadSpaceToolRequestDto] agentReadSpaceToolRequestDto (required):
  Future<Response> readSpaceWithHttpInfo(String id, AgentReadSpaceToolRequestDto agentReadSpaceToolRequestDto,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/sessions/{id}/tools/read-space'
      .replaceAll('{id}', id);

    // ignore: prefer_final_locals
    Object? postBody = agentReadSpaceToolRequestDto;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>['application/json'];


    return apiClient.invokeAPI(
      apiPath,
      'POST',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Execute the internal readSpace agent tool
  ///
  /// Internal route for requesting or resuming a strict-approved shared-space read tool call for an AI agent session.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentReadSpaceToolRequestDto] agentReadSpaceToolRequestDto (required):
  Future<AgentReadSpaceToolResponseDto?> readSpace(String id, AgentReadSpaceToolRequestDto agentReadSpaceToolRequestDto,) async {
    final response = await readSpaceWithHttpInfo(id, agentReadSpaceToolRequestDto,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'AgentReadSpaceToolResponseDto',) as AgentReadSpaceToolResponseDto;
    
    }
    return null;
  }

  /// Revise agent album operations
  ///
  /// Internal route for replacing a proposed operation plan with a new revision.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [String] planId (required):
  ///
  /// * [AgentReviseAlbumOperationsDto] agentReviseAlbumOperationsDto (required):
  Future<Response> reviseProposedOperationsWithHttpInfo(String id, String planId, AgentReviseAlbumOperationsDto agentReviseAlbumOperationsDto,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/sessions/{id}/operation-plan/{planId}/revisions'
      .replaceAll('{id}', id)
      .replaceAll('{planId}', planId);

    // ignore: prefer_final_locals
    Object? postBody = agentReviseAlbumOperationsDto;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>['application/json'];


    return apiClient.invokeAPI(
      apiPath,
      'POST',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Revise agent album operations
  ///
  /// Internal route for replacing a proposed operation plan with a new revision.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [String] planId (required):
  ///
  /// * [AgentReviseAlbumOperationsDto] agentReviseAlbumOperationsDto (required):
  Future<AgentOperationPlanToolResponseDto?> reviseProposedOperations(String id, String planId, AgentReviseAlbumOperationsDto agentReviseAlbumOperationsDto,) async {
    final response = await reviseProposedOperationsWithHttpInfo(id, planId, agentReviseAlbumOperationsDto,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'AgentOperationPlanToolResponseDto',) as AgentOperationPlanToolResponseDto;
    
    }
    return null;
  }

  /// Execute the internal searchPeople agent tool
  ///
  /// Internal route for requesting or resuming a strict-approved person name resolution tool call for an AI agent session.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentSearchPeopleToolRequestDto] agentSearchPeopleToolRequestDto (required):
  Future<Response> searchAgentPeopleWithHttpInfo(String id, AgentSearchPeopleToolRequestDto agentSearchPeopleToolRequestDto,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/sessions/{id}/tools/search-people'
      .replaceAll('{id}', id);

    // ignore: prefer_final_locals
    Object? postBody = agentSearchPeopleToolRequestDto;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>['application/json'];


    return apiClient.invokeAPI(
      apiPath,
      'POST',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Execute the internal searchPeople agent tool
  ///
  /// Internal route for requesting or resuming a strict-approved person name resolution tool call for an AI agent session.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentSearchPeopleToolRequestDto] agentSearchPeopleToolRequestDto (required):
  Future<AgentSearchPeopleToolResponseDto?> searchAgentPeople(String id, AgentSearchPeopleToolRequestDto agentSearchPeopleToolRequestDto,) async {
    final response = await searchAgentPeopleWithHttpInfo(id, agentSearchPeopleToolRequestDto,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'AgentSearchPeopleToolResponseDto',) as AgentSearchPeopleToolResponseDto;
    
    }
    return null;
  }

  /// Execute the internal searchUsers agent tool
  ///
  /// Internal route for requesting or resuming a strict-approved visible user lookup tool call for an AI agent session.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentSearchUsersToolRequestDto] agentSearchUsersToolRequestDto (required):
  Future<Response> searchAgentUsersWithHttpInfo(String id, AgentSearchUsersToolRequestDto agentSearchUsersToolRequestDto,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/sessions/{id}/tools/search-users'
      .replaceAll('{id}', id);

    // ignore: prefer_final_locals
    Object? postBody = agentSearchUsersToolRequestDto;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>['application/json'];


    return apiClient.invokeAPI(
      apiPath,
      'POST',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Execute the internal searchUsers agent tool
  ///
  /// Internal route for requesting or resuming a strict-approved visible user lookup tool call for an AI agent session.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentSearchUsersToolRequestDto] agentSearchUsersToolRequestDto (required):
  Future<AgentSearchUsersToolResponseDto?> searchAgentUsers(String id, AgentSearchUsersToolRequestDto agentSearchUsersToolRequestDto,) async {
    final response = await searchAgentUsersWithHttpInfo(id, agentSearchUsersToolRequestDto,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'AgentSearchUsersToolResponseDto',) as AgentSearchUsersToolResponseDto;
    
    }
    return null;
  }

  /// Summarize an agent operation plan
  ///
  /// Internal route for returning a compact summary of a stored operation plan.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [String] planId (required):
  ///
  /// * [AgentOperationPlanSummaryRequestDto] agentOperationPlanSummaryRequestDto (required):
  Future<Response> summarizePlanWithHttpInfo(String id, String planId, AgentOperationPlanSummaryRequestDto agentOperationPlanSummaryRequestDto,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/sessions/{id}/operation-plan/{planId}/summary'
      .replaceAll('{id}', id)
      .replaceAll('{planId}', planId);

    // ignore: prefer_final_locals
    Object? postBody = agentOperationPlanSummaryRequestDto;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>['application/json'];


    return apiClient.invokeAPI(
      apiPath,
      'POST',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Summarize an agent operation plan
  ///
  /// Internal route for returning a compact summary of a stored operation plan.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [String] planId (required):
  ///
  /// * [AgentOperationPlanSummaryRequestDto] agentOperationPlanSummaryRequestDto (required):
  Future<AgentOperationPlanToolResponseDto?> summarizePlan(String id, String planId, AgentOperationPlanSummaryRequestDto agentOperationPlanSummaryRequestDto,) async {
    final response = await summarizePlanWithHttpInfo(id, planId, agentOperationPlanSummaryRequestDto,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'AgentOperationPlanToolResponseDto',) as AgentOperationPlanToolResponseDto;
    
    }
    return null;
  }

  /// Update an agent session
  ///
  /// Update mutable metadata for an AI agent session owned by the current user.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentSessionUpdateDto] agentSessionUpdateDto (required):
  Future<Response> updateAgentSessionWithHttpInfo(String id, AgentSessionUpdateDto agentSessionUpdateDto,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/sessions/{id}'
      .replaceAll('{id}', id);

    // ignore: prefer_final_locals
    Object? postBody = agentSessionUpdateDto;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>['application/json'];


    return apiClient.invokeAPI(
      apiPath,
      'PUT',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Update an agent session
  ///
  /// Update mutable metadata for an AI agent session owned by the current user.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentSessionUpdateDto] agentSessionUpdateDto (required):
  Future<AgentSessionResponseDto?> updateAgentSession(String id, AgentSessionUpdateDto agentSessionUpdateDto,) async {
    final response = await updateAgentSessionWithHttpInfo(id, agentSessionUpdateDto,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'AgentSessionResponseDto',) as AgentSessionResponseDto;
    
    }
    return null;
  }

  /// Validate an agent session setup
  ///
  /// Validate the selected provider credential and model with the configured runner before creating a persisted AI agent session.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [AgentSessionCreateDto] agentSessionCreateDto (required):
  Future<Response> validateAgentSessionWithHttpInfo(AgentSessionCreateDto agentSessionCreateDto,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/sessions/validate';

    // ignore: prefer_final_locals
    Object? postBody = agentSessionCreateDto;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>['application/json'];


    return apiClient.invokeAPI(
      apiPath,
      'POST',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Validate an agent session setup
  ///
  /// Validate the selected provider credential and model with the configured runner before creating a persisted AI agent session.
  ///
  /// Parameters:
  ///
  /// * [AgentSessionCreateDto] agentSessionCreateDto (required):
  Future<void> validateAgentSession(AgentSessionCreateDto agentSessionCreateDto,) async {
    final response = await validateAgentSessionWithHttpInfo(agentSessionCreateDto,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
  }
}
