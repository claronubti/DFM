import React, { useState, useEffect, useRef } from 'react';
import { 
  Database, 
  TableProperties, 
  Layers, 
  ShieldCheck, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Save, 
  Trash2, 
  ChevronLeft, 
  ChevronRight 
} from 'lucide-react';
import { 
  getDataArtifacts, 
  getTableLogMapping, 
  saveTableLogMapping, 
  deleteTableLogMapping, 
  getSqlTables, 
  getSqlColumns 
} from '../../api';
import { 
  CANDIDATE_MATCHERS, 
  matchColumn, 
  extractErrorText 
} from '../../constants/auditColumnDefinitions';

import ConfigWizardSidebar from './ConfigWizardSidebar';
import StepDataSourceSelect from './StepDataSourceSelect';
import StepTableSelect from './StepTableSelect';
import StepColumnMapping from './StepColumnMapping';
import StepReviewSave from './StepReviewSave';

/**
 * TableLogConfigPage provides a 4-step full-page wizard interface for configuring Lakehouse and Warehouse table logs:
 * - Step 1 (StepDataSourceSelect): Choose Data Source (Fabric Warehouse or Lakehouse)
 * - Step 2 (StepTableSelect): Choose Log Tables (Catalog assignment for Batch Header, Bronze, Silver)
 * - Step 3 (StepColumnMapping): Map Audit Columns (Smart auto-map and manual field matching)
 * - Step 4 (StepReviewSave): Review and Save (Validation checklist and persistence)
 *
 * @param {Object} props
 * @param {string} props.workspaceId - Fabric workspace GUID.
 * @param {string} [props.workspaceName] - Fabric workspace display name.
 * @param {Function} props.onBackToMonitoring - Close / Back handler.
 * @param {Function} [props.onSaved] - Callback invoked after successfully persisting mappings.
 */
export default function TableLogConfigPage({ 
  workspaceId, 
  workspaceName, 
  onBackToMonitoring, 
  onSaved 
}) {
  const [artifacts, setArtifacts] = useState([]);
  const [selectedArtifactId, setSelectedArtifactId] = useState('');
  const [availableTables, setAvailableTables] = useState([]);
  
  // Table Selections (Schema.Table)
  const [batchHeaderTable, setBatchHeaderTable] = useState('');
  const [bronzeTable, setBronzeTable] = useState('');
  const [silverTable, setSilverTable] = useState('');

  // Column Lists per selected table
  const [batchHeaderCols, setBatchHeaderCols] = useState([]);
  const [bronzeCols, setBronzeCols] = useState([]);
  const [silverCols, setSilverCols] = useState([]);

  // Column Mappings
  const [batchHeaderMapping, setBatchHeaderMapping] = useState({});
  const [bronzeMapping, setBronzeMapping] = useState({});
  const [silverMapping, setSilverMapping] = useState({});

  const [isLoadingArtifacts, setIsLoadingArtifacts] = useState(false);
  const [isLoadingTables, setIsLoadingTables] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  // Wizard Navigation: 1: 'Choose data source', 2: 'Choose log tables', 3: 'Map audit columns', 4: 'Review and Create'
  const [activeStep, setActiveStep] = useState(1);
  const [sourceSearch, setSourceSearch] = useState('');
  const [sourceTypeFilter, setSourceTypeFilter] = useState('ALL');
  const [mappingSubTab, setMappingSubTab] = useState('batch_header');

  // Request sequencing to prevent async race conditions
  const activeReqIdRef = useRef(0);
  const abortCtrlRef = useRef(null);

  // Load existing mapping and workspace artifacts
  useEffect(() => {
    if (!workspaceId) return;

    const loadData = async () => {
      setIsLoadingArtifacts(true);
      setStatusMsg(null);
      try {
        const artJson = await getDataArtifacts(workspaceId).catch(() => ({ artifacts: [] }));
        const artList = artJson.artifacts || [];
        setArtifacts(artList);

        const mapJson = await getTableLogMapping(workspaceId).catch(() => ({ mapping: null }));
        if (mapJson?.mapping) {
          const m = mapJson.mapping;
          setSelectedArtifactId(m.artifact_id || '');
          const bhFull = (m.batch_header_schema && m.batch_header_table) ? `${m.batch_header_schema}.${m.batch_header_table}` : '';
          const brFull = (m.bronze_schema && m.bronze_table) ? `${m.bronze_schema}.${m.bronze_table}` : '';
          const slFull = (m.silver_schema && m.silver_table) ? `${m.silver_schema}.${m.silver_table}` : '';
          
          setBatchHeaderTable(bhFull);
          setBronzeTable(brFull);
          setSilverTable(slFull);

          setBatchHeaderMapping(m.batch_header_mapping || {});
          setBronzeMapping(m.bronze_mapping || {});
          setSilverMapping(m.silver_mapping || {});

          if (m.server_fqdn && m.database_name) {
            await fetchTables(m.server_fqdn, m.database_name, bhFull, brFull, slFull);
            return;
          }
        }
      } catch (err) {
        console.error("Error loading config:", err);
        setStatusMsg({ type: 'error', text: 'Failed to load workspace data sources.' });
      } finally {
        setIsLoadingArtifacts(false);
      }
    };

    loadData();
  }, [workspaceId]);

  const fetchTables = async (serverFqdn, databaseName, preBH = '', preBR = '', preSL = '') => {
    if (abortCtrlRef.current) {
      abortCtrlRef.current.abort();
    }
    const abortCtrl = new AbortController();
    abortCtrlRef.current = abortCtrl;
    const currentReqId = ++activeReqIdRef.current;

    setIsLoadingTables(true);
    setStatusMsg(null);
    setAvailableTables([]);

    try {
      const json = await getSqlTables(workspaceId, { serverFqdn, databaseName, signal: abortCtrl.signal });
      if (currentReqId !== activeReqIdRef.current) return;
      const tbls = json?.tables || [];
      setAvailableTables(tbls);

      if (preBH) {
        setBatchHeaderTable(preBH);
        const [s, t] = preBH.split('.');
        fetchCols(serverFqdn, databaseName, s, t, setBatchHeaderCols);
      }
      if (preBR) {
        setBronzeTable(preBR);
        const [s, t] = preBR.split('.');
        fetchCols(serverFqdn, databaseName, s, t, setBronzeCols);
      }
      if (preSL) {
        setSilverTable(preSL);
        const [s, t] = preSL.split('.');
        fetchCols(serverFqdn, databaseName, s, t, setSilverCols);
      }
    } catch (e) {
      if (e.name === 'AbortError') return;
      if (currentReqId !== activeReqIdRef.current) return;
      console.error("Failed to fetch tables:", e);
      setStatusMsg({ type: 'error', text: extractErrorText(e, 'Could not connect to SQL Endpoint to fetch tables.') });
    } finally {
      if (currentReqId === activeReqIdRef.current) {
        setIsLoadingTables(false);
      }
    }
  };

  const fetchCols = async (serverFqdn, databaseName, schemaName, tableName, setColState) => {
    if (!serverFqdn || !databaseName || !schemaName || !tableName) {
      setColState([]);
      return;
    }
    try {
      const json = await getSqlColumns(workspaceId, { serverFqdn, databaseName, schemaName, tableName });
      setColState(json?.columns || []);
    } catch (e) {
      console.error(`Failed to fetch columns for ${schemaName}.${tableName}:`, e);
      setStatusMsg({ type: 'error', text: extractErrorText(e, `Could not fetch columns for ${schemaName}.${tableName}.`) });
    }
  };

  const handleArtifactChange = (artId) => {
    setSelectedArtifactId(artId);
    setAvailableTables([]);
    setBatchHeaderTable('');
    setBronzeTable('');
    setSilverTable('');
    setBatchHeaderCols([]);
    setBronzeCols([]);
    setSilverCols([]);
    setBatchHeaderMapping({});
    setBronzeMapping({});
    setSilverMapping({});
    setStatusMsg(null);
    const art = artifacts.find(a => a.id === artId);
    if (art && art.serverFqdn && art.databaseName) {
      fetchTables(art.serverFqdn, art.databaseName);
    }
  };

  const handleTableChange = (tableType, fullTableName) => {
    const art = artifacts.find(a => a.id === selectedArtifactId);
    if (!art || !fullTableName) return;
    const [s, t] = fullTableName.split('.');

    if (tableType === 'batch_header') {
      setBatchHeaderTable(fullTableName);
      fetchCols(art.serverFqdn, art.databaseName, s, t, setBatchHeaderCols);
    } else if (tableType === 'bronze') {
      setBronzeTable(fullTableName);
      fetchCols(art.serverFqdn, art.databaseName, s, t, setBronzeCols);
    } else if (tableType === 'silver') {
      setSilverTable(fullTableName);
      fetchCols(art.serverFqdn, art.databaseName, s, t, setSilverCols);
    }
  };

  // Smart Auto-Map handler
  const handleAutoMap = () => {
    let mappedCount = 0;

    // Auto-map Batch Header
    if (batchHeaderCols.length > 0) {
      const newBH = { ...batchHeaderMapping };
      Object.entries(CANDIDATE_MATCHERS.batchHeader).forEach(([field, cands]) => {
        if (!newBH[field]) {
          const matched = matchColumn(batchHeaderCols, cands);
          if (matched) {
            newBH[field] = matched;
            mappedCount++;
          }
        }
      });
      setBatchHeaderMapping(newBH);
    }

    // Auto-map Bronze
    if (bronzeCols.length > 0) {
      const newBR = { ...bronzeMapping };
      Object.entries(CANDIDATE_MATCHERS.bronze).forEach(([field, cands]) => {
        if (!newBR[field]) {
          const matched = matchColumn(bronzeCols, cands);
          if (matched) {
            newBR[field] = matched;
            mappedCount++;
          }
        }
      });
      setBronzeMapping(newBR);
    }

    // Auto-map Silver
    if (silverCols.length > 0) {
      const newSL = { ...silverMapping };
      Object.entries(CANDIDATE_MATCHERS.silver).forEach(([field, cands]) => {
        if (!newSL[field]) {
          const matched = matchColumn(silverCols, cands);
          if (matched) {
            newSL[field] = matched;
            mappedCount++;
          }
        }
      });
      setSilverMapping(newSL);
    }

    setStatusMsg({
      type: 'success',
      text: mappedCount > 0 
        ? `Auto-map matched and assigned ${mappedCount} columns successfully!`
        : 'Auto-map ran. All identifiable columns were already mapped.'
    });
  };

  const handleSave = async () => {
    if (!selectedArtifactId) {
      setStatusMsg({ type: 'error', text: 'Please select a Warehouse or Lakehouse.' });
      return;
    }
    const art = artifacts.find(a => a.id === selectedArtifactId);
    if (!art) return;

    setIsSaving(true);
    setStatusMsg(null);

    const [bhSchema, bhTable] = (batchHeaderTable || '').split('.');
    const [brSchema, brTable] = (bronzeTable || '').split('.');
    const [slSchema, slTable] = (silverTable || '').split('.');

    const payload = {
      artifact_id: art.id,
      artifact_name: art.displayName,
      artifact_type: art.type,
      server_fqdn: art.serverFqdn,
      database_name: art.databaseName,
      batch_header_schema: bhSchema || '',
      batch_header_table: bhTable || '',
      bronze_schema: brSchema || '',
      bronze_table: brTable || '',
      silver_schema: slSchema || '',
      silver_table: slTable || '',
      batch_header_mapping: batchHeaderMapping,
      bronze_mapping: bronzeMapping,
      silver_mapping: silverMapping,
      artifactId: art.id,
      artifactName: art.displayName,
      artifactType: art.type,
      serverFqdn: art.serverFqdn,
      databaseName: art.databaseName,
      batchHeaderSchema: bhSchema || '',
      batchHeaderTable: bhTable || '',
      bronzeSchema: brSchema || '',
      bronzeTable: brTable || '',
      silverSchema: slSchema || '',
      silverTable: slTable || '',
      batchHeaderMapping: batchHeaderMapping,
      bronzeMapping: bronzeMapping,
      silverMapping: silverMapping
    };

    try {
      await saveTableLogMapping(workspaceId, payload);
      setStatusMsg({ type: 'success', text: 'Column mapping successfully saved and applied to Monitoring hub!' });
      if (onSaved) onSaved();
    } catch (e) {
      console.error("Save error:", e);
      setStatusMsg({ type: 'error', text: extractErrorText(e, 'Failed to save mapping.') });
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetMapping = async () => {
    if (!window.confirm("Are you sure you want to clear and reset the table logging mapping?")) return;
    setIsSaving(true);
    setStatusMsg(null);
    try {
      await deleteTableLogMapping(workspaceId);
      setStatusMsg({ type: 'success', text: 'Mapping reset. Default fallback schema will be used.' });
      setBatchHeaderTable('');
      setBronzeTable('');
      setSilverTable('');
      setBatchHeaderMapping({});
      setBronzeMapping({});
      setSilverMapping({});
      if (onSaved) onSaved();
    } catch (e) {
      console.error("Reset error:", e);
      setStatusMsg({ type: 'error', text: extractErrorText(e, 'Failed to reset mapping.') });
    } finally {
      setIsSaving(false);
    }
  };

  const currentArtifact = artifacts.find(a => a.id === selectedArtifactId);

  // Stepper completion checks
  const isStep1Complete = !!selectedArtifactId;
  const isStep2Complete = !!(batchHeaderTable || bronzeTable || silverTable);
  const isStep3Complete = Object.keys(batchHeaderMapping).length > 0 || Object.keys(bronzeMapping).length > 0;
  const isStep4Complete = isStep1Complete && isStep2Complete;

  const steps = [
    {
      number: 1,
      id: 'source',
      title: 'Choose data source',
      subtitle: 'Select Lakehouse or Warehouse',
      isCompleted: isStep1Complete,
      icon: Database
    },
    {
      number: 2,
      id: 'tables',
      title: 'Choose log tables',
      subtitle: 'Select catalog log tables',
      isCompleted: isStep2Complete,
      icon: TableProperties
    },
    {
      number: 3,
      id: 'mapping',
      title: 'Map audit columns',
      subtitle: 'Map schema fields & metrics',
      isCompleted: isStep3Complete,
      icon: Layers
    },
    {
      number: 4,
      id: 'review',
      title: 'Review and Create',
      subtitle: 'Verify & apply to workspace',
      isCompleted: isStep4Complete,
      icon: ShieldCheck
    }
  ];

  const totalMappedColumns = 
    Object.keys(batchHeaderMapping).filter(k => batchHeaderMapping[k]).length +
    Object.keys(bronzeMapping).filter(k => bronzeMapping[k]).length +
    Object.keys(silverMapping).filter(k => silverMapping[k]).length;

  return (
    <div className="flex-1 flex flex-col min-h-0 w-full bg-white text-[#242424] font-sans select-none overflow-hidden">
      {/* Full-Page Wizard Title Bar */}
      <div className="border-b border-[#edebe9] px-8 py-3.5 flex items-center justify-between bg-white shrink-0">
        <div>
          <span className="text-xs font-semibold text-[#616161] tracking-wide block">
            Table Catalog Configuration
          </span>
          <h1 className="text-xl font-semibold text-[#242424] tracking-tight mt-0.5">
            {steps[activeStep - 1]?.title}
          </h1>
        </div>

        <button
          onClick={onBackToMonitoring}
          title="Close and return to Monitoring hub"
          className="p-1.5 rounded hover:bg-[#f5f5f5] text-[#616161] hover:text-[#242424] transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Full-Page Wizard Body */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Vertical Stepper Rail */}
        <ConfigWizardSidebar 
          steps={steps} 
          activeStep={activeStep} 
          onSelectStep={setActiveStep} 
        />

        {/* Right Active Step Content */}
        <main className="flex-1 overflow-y-auto p-6 lg:p-8 bg-white flex flex-col min-h-0">
          {/* Status Feedback Toast */}
          {statusMsg && (
            <div className={`p-3.5 mb-6 rounded-md border flex items-center justify-between shadow-xs animate-in fade-in duration-150 ${
              statusMsg.type === 'success'
                ? 'bg-[#e3f7ef] border-[#117865]/30 text-[#117865]'
                : 'bg-[#fde7e9] border-[#f19999] text-[#a80000]'
            }`}>
              <div className="flex items-center gap-2.5 text-xs font-medium">
                {statusMsg.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{statusMsg.text}</span>
              </div>
              <button
                onClick={() => setStatusMsg(null)}
                className="text-xs font-semibold hover:underline cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Step 1: Choose Data Source */}
          {activeStep === 1 && (
            <StepDataSourceSelect
              artifacts={artifacts}
              selectedArtifactId={selectedArtifactId}
              onSelectArtifact={handleArtifactChange}
              isLoadingArtifacts={isLoadingArtifacts}
              sourceSearch={sourceSearch}
              onSearchChange={setSourceSearch}
              sourceTypeFilter={sourceTypeFilter}
              onTypeFilterChange={setSourceTypeFilter}
            />
          )}

          {/* Step 2: Choose Log Tables */}
          {activeStep === 2 && (
            <StepTableSelect
              currentArtifact={currentArtifact}
              availableTables={availableTables}
              isLoadingTables={isLoadingTables}
              batchHeaderTable={batchHeaderTable}
              bronzeTable={bronzeTable}
              silverTable={silverTable}
              batchHeaderColCount={batchHeaderCols.length}
              bronzeColCount={bronzeCols.length}
              silverColCount={silverCols.length}
              onTableChange={handleTableChange}
            />
          )}

          {/* Step 3: Map Audit Columns */}
          {activeStep === 3 && (
            <StepColumnMapping
              mappingSubTab={mappingSubTab}
              onSubTabChange={setMappingSubTab}
              onAutoMap={handleAutoMap}
              batchHeaderTable={batchHeaderTable}
              bronzeTable={bronzeTable}
              silverTable={silverTable}
              batchHeaderCols={batchHeaderCols}
              bronzeCols={bronzeCols}
              silverCols={silverCols}
              batchHeaderMapping={batchHeaderMapping}
              bronzeMapping={bronzeMapping}
              silverMapping={silverMapping}
              onUpdateBatchHeaderMapping={(k, v) => setBatchHeaderMapping(prev => ({ ...prev, [k]: v }))}
              onUpdateBronzeMapping={(k, v) => setBronzeMapping(prev => ({ ...prev, [k]: v }))}
              onUpdateSilverMapping={(k, v) => setSilverMapping(prev => ({ ...prev, [k]: v }))}
            />
          )}

          {/* Step 4: Review and Create */}
          {activeStep === 4 && (
            <StepReviewSave
              currentArtifact={currentArtifact}
              batchHeaderTable={batchHeaderTable}
              bronzeTable={bronzeTable}
              silverTable={silverTable}
              isStep1Complete={isStep1Complete}
              isStep2Complete={isStep2Complete}
              pipelineRunIdCol={batchHeaderMapping.pipeline_run_id_col}
              totalMappedColumns={totalMappedColumns}
            />
          )}
        </main>
      </div>

      {/* Wizard Footer Action Bar */}
      <footer className="border-t border-[#edebe9] px-8 py-3.5 bg-white flex items-center justify-between shrink-0 shadow-xs">
        <button
          type="button"
          onClick={handleResetMapping}
          className="text-xs text-[#a80000] hover:underline flex items-center gap-1.5 transition cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Reset Configuration</span>
        </button>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            disabled={activeStep === 1}
            onClick={() => setActiveStep(prev => Math.max(prev - 1, 1))}
            className="px-4 py-1.5 rounded-md border border-[#d1d1d1] bg-white text-[#242424] hover:bg-[#f5f5f5] text-xs font-medium transition flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed shadow-xs cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </button>

          {activeStep < 4 ? (
            <button
              type="button"
              onClick={() => setActiveStep(prev => Math.min(prev + 1, 4))}
              className="px-5 py-1.5 rounded-md bg-[#117865] hover:bg-[#0c5e4f] text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-1.5 rounded-md bg-[#117865] hover:bg-[#0c5e4f] text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Save & Apply Configuration</span>
                </>
              )}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
