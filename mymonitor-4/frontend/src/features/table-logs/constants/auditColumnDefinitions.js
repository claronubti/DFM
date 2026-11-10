/**
 * Audit Column Definitions and Candidate Matchers for Lakehouse/Warehouse Table Logging.
 * Used by the Table Catalog configuration wizard for dynamic column mapping and auto-detection.
 */

export const CANDIDATE_MATCHERS = {
  batchHeader: {
    pipeline_run_id_col: ['pipelinerunid', 'runid', 'pipeline_run_id', 'fabricrunid'],
    batch_id_col: ['batchid', 'batch_id', 'id', 'batchpk'],
    pipeline_name_col: ['pipelinename', 'pipeline_name', 'name', 'pipelinedisplayname'],
    status_col: ['status', 'batchstatus', 'state', 'executionstatus'],
    start_time_col: ['starttime', 'start_time', 'executionstarttime', 'batchstarttime'],
    duration_col: ['duration', 'durationms', 'durationseconds', 'durationminutes'],
    error_message_col: ['errormessage', 'error_message', 'error', 'errordescription']
  },
  bronze: {
    batch_id_col: ['batchid', 'batch_id', 'id'],
    table_name_col: ['tablename', 'table_name', 'targettable', 'schematable'],
    schema_name_col: ['schemaname', 'schema_name', 'targetschema'],
    rows_processed_col: ['rowsprocessed', 'rows_processed', 'rowcount', 'ingestedrows', 'rowsingested'],
    status_col: ['status', 'ingestionstatus', 'state'],
    start_time_col: ['starttime', 'start_time', 'loadtime'],
    end_time_col: ['endtime', 'end_time'],
    duration_col: ['duration', 'durationseconds', 'durationms'],
    error_message_col: ['errormessage', 'error_message', 'error']
  },
  silver: {
    batch_id_col: ['batchid', 'batch_id', 'id'],
    table_name_col: ['tablename', 'table_name', 'targettable'],
    schema_name_col: ['schemaname', 'schema_name', 'targetschema'],
    rows_processed_col: ['rowsprocessed', 'rows_processed', 'rowcount', 'insertedrows', 'refinedrows'],
    status_col: ['status', 'processingstatus', 'state'],
    start_time_col: ['starttime', 'start_time'],
    end_time_col: ['endtime', 'end_time'],
    duration_col: ['duration', 'durationseconds', 'durationms'],
    error_message_col: ['errormessage', 'error_message', 'error']
  }
};

export const BATCH_HEADER_FIELD_DEFS = [
  {
    key: 'pipeline_run_id_col',
    label: 'Pipeline Run ID (Telemetry correlation)',
    description: 'Unique Fabric pipeline run ID mapped to this batch header record.'
  },
  {
    key: 'batch_id_col',
    label: 'Batch ID (Primary Key)',
    description: 'Unique batch identifier that joins summary with Bronze & Silver log rows.'
  },
  {
    key: 'pipeline_name_col',
    label: 'Pipeline Name',
    description: 'Human-readable pipeline name displayed in header and batch switcher.'
  },
  {
    key: 'status_col',
    label: 'Batch Execution Status',
    description: 'Execution status column (Success, Failure, In Progress).'
  },
  {
    key: 'start_time_col',
    label: 'Start Time',
    description: 'Batch execution start timestamp.'
  },
  {
    key: 'duration_col',
    label: 'Duration',
    description: 'Overall batch execution duration in minutes or seconds.'
  },
  {
    key: 'error_message_col',
    label: 'Error Message',
    description: 'Execution error message if the batch failed.'
  }
];

export const BRONZE_FIELD_DEFS = [
  {
    key: 'batch_id_col',
    label: 'Batch ID (Foreign Key)',
    description: 'Foreign key column matching the Batch Header BatchId.'
  },
  {
    key: 'table_name_col',
    label: 'Table Name',
    description: 'Name of the ingested Bronze table.'
  },
  {
    key: 'schema_name_col',
    label: 'Schema Name',
    description: 'Schema of the ingested Bronze table (e.g. dbo, raw, bronze).'
  },
  {
    key: 'rows_processed_col',
    label: 'Rows Ingested / Processed',
    description: 'Number of rows loaded into Bronze layer.'
  },
  {
    key: 'status_col',
    label: 'Status',
    description: 'Ingestion status for the specific table.'
  },
  {
    key: 'start_time_col',
    label: 'Start Time',
    description: 'Extraction start timestamp.'
  },
  {
    key: 'end_time_col',
    label: 'End Time',
    description: 'Extraction completion timestamp.'
  },
  {
    key: 'duration_col',
    label: 'Duration',
    description: 'Table extraction duration in seconds or minutes.'
  },
  {
    key: 'error_message_col',
    label: 'Error Message',
    description: 'Error description if extraction failed.'
  }
];

export const SILVER_FIELD_DEFS = [
  {
    key: 'batch_id_col',
    label: 'Batch ID (Foreign Key)',
    description: 'Foreign key column matching the Batch Header BatchId.'
  },
  {
    key: 'table_name_col',
    label: 'Table Name',
    description: 'Name of the transformed Silver table.'
  },
  {
    key: 'schema_name_col',
    label: 'Schema Name',
    description: 'Database schema of the silver table (e.g. dbo, silver).'
  },
  {
    key: 'rows_processed_col',
    label: 'Rows Refined / Processed',
    description: 'Transformed row count loaded into Silver.'
  },
  {
    key: 'status_col',
    label: 'Status',
    description: 'Silver refinement status.'
  },
  {
    key: 'start_time_col',
    label: 'Start Time',
    description: 'Refinement start timestamp.'
  },
  {
    key: 'end_time_col',
    label: 'End Time',
    description: 'Refinement end timestamp.'
  },
  {
    key: 'duration_col',
    label: 'Duration',
    description: 'Refinement duration in seconds or minutes.'
  },
  {
    key: 'error_message_col',
    label: 'Error Message',
    description: 'Error description if silver transformation failed.'
  }
];

/**
 * Normalizes candidates and column names to find the best match.
 *
 * @param {Array} cols - Available database column objects.
 * @param {Array} candidates - Candidate strings to search for.
 * @returns {string} Matching column name, or empty string.
 */
export function matchColumn(cols, candidates) {
  if (!cols || !Array.isArray(cols)) return '';
  for (const cand of candidates) {
    const normCand = cand.toLowerCase().replace(/[^a-z0-9]/g, '');
    const found = cols.find(c => c.name?.toLowerCase().replace(/[^a-z0-9]/g, '') === normCand);
    if (found) return found.name;
  }
  return '';
}

/**
 * Safely extracts error description text from API error objects.
 *
 * @param {*} err - Error response or exception.
 * @param {string} defaultMsg - Fallback text if error cannot be parsed.
 * @returns {string}
 */
export function extractErrorText(err, defaultMsg) {
  if (!err) return defaultMsg;
  if (typeof err === 'string') return err;
  const d = err.detail !== undefined ? err.detail : err;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) {
    return d.map(item => (typeof item === 'object' ? (item.msg || JSON.stringify(item)) : String(item))).join('; ');
  }
  if (typeof d === 'object') {
    return d.msg || d.message || JSON.stringify(d);
  }
  return String(d);
}
