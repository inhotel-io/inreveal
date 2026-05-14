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
}
