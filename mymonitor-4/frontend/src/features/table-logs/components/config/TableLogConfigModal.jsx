import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Database, 
  Check, 
  AlertCircle, 
  Save, 
  RefreshCw, 
  TableProperties, 
  Trash2, 
  CheckCircle2, 
  Sparkles
} from 'lucide-react';
import MappingRow from './MappingRow';
import { 
  CANDIDATE_MATCHERS, 
  BATCH_HEADER_FIELD_DEFS, 
  BRONZE_FIELD_DEFS, 
  SILVER_FIELD_DEFS, 
  matchColumn, 
  extractErrorText 
} from '../../constants/auditColumnDefinitions';

/**
 * TableLogConfigModal provides a floating modal dialog overlay for configuring
 * Fabric Warehouse/Lakehouse data source, log tables, and column mappings.
 *
 * @param {Object} props
 * @param {string} props.workspaceId - Fabric workspace GUID.
 * @param {boolean} props.isOpen - Whether modal is visible.
 * @param {Function} props.onClose - Modal close handler.
 * @param {Function} [props.onSaved] - Callback when mappings are saved.
 */
export default function TableLogConfigModal({ workspaceId, isOpen, onClose, onSaved }) {
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
  const [activeTab, setActiveTab] = useState('source'); // 'source' | 'batch_header' | 'bronze' | 'silver'

  // Request sequencing to prevent async race conditions
  const activeReqIdRef = useRef(0);
  const abortCtrlRef = useRef(null);

  // Load existing mapping and workspace artifacts
  useEffect(() => {
    if (!isOpen || !workspaceId) return;

    const loadData = async () => {
      setIsLoadingArtifacts(true);
      setStatusMsg(null);
      try {
        const artRes = await fetch(`/api/workspaces/${workspaceId}/data-artifacts`);
        let artList = [];
        if (artRes.ok) {
          const artJson = await artRes.json();
          artList = artJson.artifacts || [];
          setArtifacts(artList);
        }

        const mapRes = await fetch(`/api/workspaces/${workspaceId}/table-log-mapping`);
        if (mapRes.ok) {
          const mapJson = await mapRes.json();
          if (mapJson.mapping) {
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
        }
      } catch (err) {
        console.error("Error loading config:", err);
        setStatusMsg({ type: 'error', text: 'Failed to load workspace data sources.' });
      } finally {
        setIsLoadingArtifacts(false);
      }
    };

    loadData();
  }, [isOpen, workspaceId]);

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
      const res = await fetch(`/api/workspaces/${workspaceId}/sql-metadata/tables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverFqdn, databaseName }),
        signal: abortCtrl.signal
      });

      if (currentReqId !== activeReqIdRef.current) return;

      if (res.ok) {
        const json = await res.json();
        const tbls = json.tables || [];
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
      } else {
        const errJson = await res.json().catch(() => ({}));
        setStatusMsg({ type: 'error', text: extractErrorText(errJson, 'Could not connect to SQL Endpoint to fetch tables.') });
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
      const res = await fetch(`/api/workspaces/${workspaceId}/sql-metadata/columns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverFqdn, databaseName, schemaName, tableName })
      });
      if (res.ok) {
        const json = await res.json();
        setColState(json.columns || []);
      }
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

  const handleAutoMap = () => {
    let mappedCount = 0;

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
        : 'Auto-map completed. All identifiable columns were already mapped.'
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
      const res = await fetch(`/api/workspaces/${workspaceId}/table-log-mapping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setStatusMsg({ type: 'success', text: 'Column mapping successfully saved and applied!' });
        if (onSaved) onSaved();
        setTimeout(() => onClose(), 1200);
      } else {
        const err = await res.json().catch(() => ({}));
        setStatusMsg({ type: 'error', text: extractErrorText(err, 'Failed to save mapping.') });
      }
    } catch (e) {
      console.error("Save error:", e);
      setStatusMsg({ type: 'error', text: 'Network error saving mapping.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetMapping = async () => {
    if (!window.confirm("Are you sure you want to clear and reset the table logging mapping?")) return;
    setIsSaving(true);
    setStatusMsg(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/table-log-mapping`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setStatusMsg({ type: 'success', text: 'Mapping reset. Default fallback schema will be used.' });
        setBatchHeaderTable('');
        setBronzeTable('');
        setSilverTable('');
        setBatchHeaderMapping({});
        setBronzeMapping({});
        setSilverMapping({});
        if (onSaved) onSaved();
      } else {
        const err = await res.json().catch(() => ({}));
        setStatusMsg({ type: 'error', text: extractErrorText(err, 'Failed to reset mapping.') });
      }
    } catch (e) {
      console.error("Reset error:", e);
      setStatusMsg({ type: 'error', text: 'Failed to reset mapping.' });
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const currentArtifact = artifacts.find(a => a.id === selectedArtifactId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150 select-none">
      <div className="relative w-full max-w-4xl bg-[#ffffff] border border-[#edebe9] rounded shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#edebe9] bg-[#faf9f8]">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded bg-[#eff6fc] text-[#0f6cbd] border border-[#d1d1d1]">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[#242424]">
                Lakehouse / Warehouse & Dynamic Column Mapping
              </h2>
              <p className="text-xs text-[#605e5c]">
                Connect dynamically to your Fabric SQL Endpoint and map table logging schemas
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-[#605e5c] hover:text-[#242424] hover:bg-[#f3f2f1] transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[#edebe9] bg-[#faf9f8] px-5 gap-2 text-xs font-medium">
          <button
            onClick={() => setActiveTab('source')}
            className={`py-2.5 px-3 border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'source'
                ? 'border-[#0f6cbd] text-[#0f6cbd] font-semibold bg-[#ffffff]'
                : 'border-transparent text-[#605e5c] hover:text-[#242424]'
            }`}
          >
            <Database className="w-3.5 h-3.5 text-[#008272]" />
            1. Source & Tables
          </button>
          <button
            onClick={() => setActiveTab('batch_header')}
            className={`py-2.5 px-3 border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'batch_header'
                ? 'border-[#0f6cbd] text-[#0f6cbd] font-semibold bg-[#ffffff]'
                : 'border-transparent text-[#605e5c] hover:text-[#242424]'
            }`}
          >
            <TableProperties className="w-3.5 h-3.5 text-[#0f6cbd]" />
            2. Batch Header Mapping
          </button>
          <button
            onClick={() => setActiveTab('bronze')}
            className={`py-2.5 px-3 border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'bronze'
                ? 'border-[#0f6cbd] text-[#0f6cbd] font-semibold bg-[#ffffff]'
                : 'border-transparent text-[#605e5c] hover:text-[#242424]'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-[#d83b01] inline-block" />
            3. Bronze Log Mapping
          </button>
          <button
            onClick={() => setActiveTab('silver')}
            className={`py-2.5 px-3 border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'silver'
                ? 'border-[#0f6cbd] text-[#0f6cbd] font-semibold bg-[#ffffff]'
                : 'border-transparent text-[#605e5c] hover:text-[#242424]'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-[#0078d4] inline-block" />
            4. Silver Log Mapping
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4 text-xs text-[#242424]">
          {statusMsg && (
            <div className={`p-3 rounded flex items-center gap-2 border ${
              statusMsg.type === 'success'
                ? 'bg-[#dff6dd] border-[#107c41]/30 text-[#107c41]'
                : 'bg-[#fde7e9] border-[#f4b4b9] text-[#c42b1c]'
            }`}>
              {statusMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              <span className="font-medium">{statusMsg.text}</span>
            </div>
          )}

          {/* TAB 1: Source & Tables */}
          {activeTab === 'source' && (
            <div className="space-y-4">
              <div className="bg-[#faf9f8] p-4 rounded border border-[#edebe9] space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-[#242424] flex items-center gap-2 text-xs">
                    <Database className="w-4 h-4 text-[#008272]" />
                    Select Warehouse or Lakehouse
                  </label>
                  {isLoadingArtifacts && (
                    <span className="flex items-center gap-1.5 text-[11px] text-[#0f6cbd] animate-pulse">
                      <RefreshCw className="w-3 h-3 animate-spin" /> Querying Fabric API...
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {artifacts.length === 0 && !isLoadingArtifacts && (
                    <p className="text-[#605e5c] italic col-span-2 text-xs">
                      No Lakehouse or Warehouse found in this workspace.
                    </p>
                  )}
                  {artifacts.map((art) => {
                    const isSel = art.id === selectedArtifactId;
                    return (
                      <button
                        key={art.id}
                        type="button"
                        onClick={() => handleArtifactChange(art.id)}
                        className={`p-3 rounded border text-left transition flex items-start gap-2.5 cursor-pointer ${
                          isSel
                            ? 'bg-[#eff6fc] border-[#0f6cbd] shadow-xs'
                            : 'bg-[#ffffff] border-[#edebe9] hover:border-[#d1d1d1]'
                        }`}
                      >
                        <div className="p-1.5 rounded bg-[#f3f2f1] text-[#008272] shrink-0 mt-0.5">
                          <Database className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-xs text-[#242424] truncate">{art.displayName}</div>
                          <div className="text-[10px] text-[#605e5c] uppercase font-mono">{art.type}</div>
                        </div>
                        {isSel && <Check className="w-4 h-4 text-[#0f6cbd] shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 2: Assign Tables */}
              {selectedArtifactId && (
                <div className="bg-[#faf9f8] p-4 rounded border border-[#edebe9] space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-[#242424] flex items-center gap-2 text-xs">
                      <TableProperties className="w-4 h-4 text-[#0f6cbd]" />
                      Assign Log Tables ({currentArtifact?.displayName})
                    </label>
                    {isLoadingTables && (
                      <span className="flex items-center gap-1.5 text-[11px] text-[#0f6cbd] animate-pulse">
                        <RefreshCw className="w-3 h-3 animate-spin" /> Querying SQL Endpoint tables...
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Batch Header */}
                    <div className="p-3 rounded bg-[#ffffff] border border-[#edebe9] space-y-2">
                      <span className="font-medium text-xs text-[#242424] block">1. Batch Header Table</span>
                      <select
                        value={batchHeaderTable}
                        onChange={(e) => handleTableChange('batch_header', e.target.value)}
                        className="w-full bg-[#ffffff] border border-[#d1d1d1] rounded px-2.5 py-1.5 text-xs text-[#242424] font-mono focus:outline-none focus:border-[#0f6cbd] cursor-pointer"
                      >
                        <option value="">-- Select Table --</option>
                        {availableTables.map(t => (
                          <option key={`bh-${t.fullName}`} value={t.fullName}>{t.fullName}</option>
                        ))}
                      </select>
                      {batchHeaderTable && (
                        <div className="text-[11px] text-[#107c41]">✓ {batchHeaderCols.length} columns found</div>
                      )}
                    </div>

                    {/* Bronze */}
                    <div className="p-3 rounded bg-[#ffffff] border border-[#edebe9] space-y-2">
                      <span className="font-medium text-xs text-[#242424] block">2. Bronze Log Table</span>
                      <select
                        value={bronzeTable}
                        onChange={(e) => handleTableChange('bronze', e.target.value)}
                        className="w-full bg-[#ffffff] border border-[#d1d1d1] rounded px-2.5 py-1.5 text-xs text-[#242424] font-mono focus:outline-none focus:border-[#0f6cbd] cursor-pointer"
                      >
                        <option value="">-- Select Table --</option>
                        {availableTables.map(t => (
                          <option key={`br-${t.fullName}`} value={t.fullName}>{t.fullName}</option>
                        ))}
                      </select>
                      {bronzeTable && (
                        <div className="text-[11px] text-[#107c41]">✓ {bronzeCols.length} columns found</div>
                      )}
                    </div>

                    {/* Silver */}
                    <div className="p-3 rounded bg-[#ffffff] border border-[#edebe9] space-y-2">
                      <span className="font-medium text-xs text-[#242424] block">3. Silver Log Table</span>
                      <select
                        value={silverTable}
                        onChange={(e) => handleTableChange('silver', e.target.value)}
                        className="w-full bg-[#ffffff] border border-[#d1d1d1] rounded px-2.5 py-1.5 text-xs text-[#242424] font-mono focus:outline-none focus:border-[#0f6cbd] cursor-pointer"
                      >
                        <option value="">-- Select Table --</option>
                        {availableTables.map(t => (
                          <option key={`sl-${t.fullName}`} value={t.fullName}>{t.fullName}</option>
                        ))}
                      </select>
                      {silverTable && (
                        <div className="text-[11px] text-[#107c41]">✓ {silverCols.length} columns found</div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Batch Header Mapping */}
          {activeTab === 'batch_header' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[#edebe9]">
                <div>
                  <h3 className="font-semibold text-xs text-[#242424]">Batch Header Column Mappings</h3>
                  <p className="text-[11px] text-[#605e5c]">Map attributes to {batchHeaderTable || "selected table"}</p>
                </div>
                <button
                  type="button"
                  onClick={handleAutoMap}
                  className="px-2.5 py-1 rounded bg-[#eff6fc] hover:bg-[#deecf9] text-[#0f6cbd] text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Auto-Map</span>
                </button>
              </div>

              <div className="space-y-2">
                {BATCH_HEADER_FIELD_DEFS.map((f) => (
                  <MappingRow
                    key={f.key}
                    label={f.label}
                    description={f.description}
                    currentVal={batchHeaderMapping[f.key]}
                    columns={batchHeaderCols}
                    onChange={(val) => setBatchHeaderMapping(prev => ({ ...prev, [f.key]: val }))}
                  />
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: Bronze Log Mapping */}
          {activeTab === 'bronze' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[#edebe9]">
                <div>
                  <h3 className="font-semibold text-xs text-[#242424]">Bronze Layer Audit Column Mappings</h3>
                  <p className="text-[11px] text-[#605e5c]">Map attributes to {bronzeTable || "selected table"}</p>
                </div>
                <button
                  type="button"
                  onClick={handleAutoMap}
                  className="px-2.5 py-1 rounded bg-[#eff6fc] hover:bg-[#deecf9] text-[#0f6cbd] text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Auto-Map</span>
                </button>
              </div>

              <div className="space-y-2">
                {BRONZE_FIELD_DEFS.map((f) => (
                  <MappingRow
                    key={f.key}
                    label={f.label}
                    description={f.description}
                    currentVal={bronzeMapping[f.key]}
                    columns={bronzeCols}
                    onChange={(val) => setBronzeMapping(prev => ({ ...prev, [f.key]: val }))}
                  />
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: Silver Log Mapping */}
          {activeTab === 'silver' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[#edebe9]">
                <div>
                  <h3 className="font-semibold text-xs text-[#242424]">Silver Layer Audit Column Mappings</h3>
                  <p className="text-[11px] text-[#605e5c]">Map attributes to {silverTable || "selected table"}</p>
                </div>
                <button
                  type="button"
                  onClick={handleAutoMap}
                  className="px-2.5 py-1 rounded bg-[#eff6fc] hover:bg-[#deecf9] text-[#0f6cbd] text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Auto-Map</span>
                </button>
              </div>

              <div className="space-y-2">
                {SILVER_FIELD_DEFS.map((f) => (
                  <MappingRow
                    key={f.key}
                    label={f.label}
                    description={f.description}
                    currentVal={silverMapping[f.key]}
                    columns={silverCols}
                    onChange={(val) => setSilverMapping(prev => ({ ...prev, [f.key]: val }))}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[#edebe9] bg-[#faf9f8] text-xs">
          <div className="flex items-center gap-2 text-[#605e5c] text-[11px]">
            <span className="w-2 h-2 rounded-full bg-[#107c41]"></span>
            <span>All selections are 100% dynamic without hardcoded defaults.</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetMapping}
              title="Clear all saved mappings and reset"
              className="px-3 py-1.5 rounded bg-[#ffffff] hover:bg-[#fde7e9] border border-[#d1d1d1] text-[#c42b1c] transition text-xs flex items-center gap-1.5 font-medium cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-[#c42b1c]" />
              <span>Reset Mapping</span>
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-1.5 rounded bg-[#0f6cbd] hover:bg-[#115ea3] text-white font-medium flex items-center gap-1.5 transition shadow-xs disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? "Saving..." : "Save Mapping"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
