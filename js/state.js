/* ==========================================================================
   BBMP Borewell Dashboard - Global Application State & DOM Cache
   ========================================================================== */

let wardLayerMode = 'qc';
let wardIndicatorsByNo = new Map();

const map = L.map('map', { zoomControl: false }).setView(bangaloreCenter, 11);
L.control.zoom({ position: 'bottomright' }).addTo(map);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let shapeLayer = null;
let lakeLayer = null;
let sensorLayer = L.layerGroup().addTo(map);
let currentDataSource = 'kh';
let wardStatusFilter = '';
let wardAnalysisLens = 'groundwater';
let commonLensCount = 2;
let groundwaterMethodMode = 'dashboard';

const groundwaterMethodOptions = [
  { value: 'dashboard', label: 'Linear + Mann-Kendall with Review' },
  { value: 'linear', label: 'Linear only' },
  { value: 'theil', label: 'Theil-Sen only' },
  { value: 'mann', label: 'Mann-Kendall only' },
  { value: 'linear_theil', label: 'Linear + Theil-Sen' },
  { value: 'linear_mann', label: 'Linear + Mann-Kendall' },
  { value: 'theil_mann', label: 'Theil-Sen + Mann-Kendall' },
  { value: 'all_three', label: 'Linear + Theil-Sen + Mann-Kendall' }
];

const wardAnalysisLensOptions = [
  { value: 'groundwater', label: 'Groundwater Decline' },
  { value: 'overall', label: 'Common' },
  { value: 'volumetric_deficit', label: 'High Volumetric Deficit (ML)' },
  { value: 'extraction', label: 'High Extraction' },
  { value: 'pumping_stress', label: 'High Pumping Stress (Drawdown/m3)' },
  { value: 'consumption', label: 'Previous Consumption Criticality' },
  { value: 'specific_capacity', label: 'Low Specific Capacity' }
];
let groundwaterMethodDefaultInitialized = false;
let latestWardStatusCounts = { critical: 0, rise: 0, stable: 0 };
let sensors = [];
let sensorQcByUid = new Map();
let wardQcByNo = new Map();
let wardQcByName = new Map();
let wardIndicatorsByName = new Map();
let wardWeeklyByNo = new Map();
let criticalGroundwaterByNo = new Map();
let consumptionByWardName = new Map();
let consumptionByCanonicalName = new Map();
let consumptionByWardNo = new Map();
let consumptionRows = [];
let populationByWardNo = new Map();
let populationByCanonicalName = new Map();
let specificCapacityByWardNo = new Map();
let pumpingPerformanceByWardNo = new Map();
let pumpingPerformanceWardSummaryByNo = new Map();
let pumpingPerformanceWardThresholds = {};
let dashboardDataCache = new Map();
let sharedDashboardDataCache = null;
let loadSequence = 0;
let wardFeatures = [];
let wardLayers = [];
let focusedWardNo = '';
let selectedSensor = null;
let selectedRange = 'week';
let waterPoints = [];
let showGroundwaterOutliers = false;
let showCycleConnector = true;
let waterChart = null;
let dischargeChart = null;
let wardInlineCharts = [];
let activeWardData = null;
let activeSpecificCapacityData = null;
let activeWardProps = null;
let activeWardSensors = [];
let wardLevelStatistic = 'average';
let fullscreenChart = null;
let fullscreenSource = null;
let selectionSequence = 0;
let legendFilter = 'both';
let qcFilter = '';
let reviewReasonFilter = '';

const els = {
  refreshStatus: document.getElementById('refreshStatus'),
  search: document.getElementById('search'),
  fitSensors: document.getElementById('fitSensors'),
  refreshData: document.getElementById('refreshData'),
  clearSelection: document.getElementById('clearSelection'),
  sensorList: document.getElementById('sensorList'),
  totalCount: document.getElementById('totalCount'),
  withDataCount: document.getElementById('withDataCount'),
  withoutDataCount: document.getElementById('withoutDataCount'),
  goodQcCount: document.getElementById('goodQcCount'),
  reviewQcCount: document.getElementById('reviewQcCount'),
  reviewQcBreakdown: document.getElementById('reviewQcBreakdown'),
  wardSensorCount: document.getElementById('wardSensorCount'),
  specificCapacityCount: document.getElementById('specificCapacityCount'),
  filteredCount: document.getElementById('filteredCount'),
  methodSummary: document.getElementById('methodSummary'),
  exportFiltered: document.getElementById('exportFiltered'),
  downloadWeeklyLevelsCsv: document.getElementById('downloadWeeklyLevelsCsv'),
  downloadNotUsableCsv: document.getElementById('downloadNotUsableCsv'),
  downloadSpecificCapacity: document.getElementById('downloadSpecificCapacity'),
  downloadCriticalGroundwater: document.getElementById('downloadCriticalGroundwater'),
  downloadCriticalComparison: document.getElementById('downloadCriticalComparison'),
  toast: document.getElementById('toast'),
  detailTitle: document.getElementById('detailTitle'),
  detailSubhead: document.getElementById('detailSubhead'),
  detailUid: document.getElementById('detailUid'),
  detailWardNo: document.getElementById('detailWardNo'),
  detailWardName: document.getElementById('detailWardName'),
  detailMotorHp: document.getElementById('detailMotorHp'),
  detailBorewellDepth: document.getElementById('detailBorewellDepth'),
  detailLatLon: document.getElementById('detailLatLon'),
  detailFirstData: document.getElementById('detailFirstData'),
  detailLastData: document.getElementById('detailLastData'),
  detailReadings: document.getElementById('detailReadings'),
  detailDataType: document.getElementById('detailDataType'),
  detailQcStatus: document.getElementById('detailQcStatus'),
  detailQcScore: document.getElementById('detailQcScore'),
  detailQcFlags: document.getElementById('detailQcFlags'),
  detailQcReasons: document.getElementById('detailQcReasons'),

  sensorQcSection: document.getElementById('sensorQcSection'),
  waterChartBox: document.getElementById('waterChartBox'),
  dischargeChartBox: document.getElementById('dischargeChartBox'),
  timeRangeSection: document.getElementById('timeRangeSection'),
  sensorDetailGrid: document.getElementById('sensorDetailGrid'),
  sensorExportControls: document.getElementById('sensorExportControls'),
  exportWaterCsv: document.getElementById('exportWaterCsv'),
  exportDischargeCsv: document.getElementById('exportDischargeCsv'),
  downloadAllRawExcel: document.getElementById('downloadAllRawExcel'),
  wardDetailPanel: document.getElementById('wardDetailPanel'),
  wardDetailTitle: document.getElementById('wardDetailTitle'),
  wardDetailSubhead: document.getElementById('wardDetailSubhead'),
  wardDetailSensors: document.getElementById('wardDetailSensors'),
  wardDetailGood: document.getElementById('wardDetailSensorsGood'),
  wardDetailUsable: document.getElementById('wardDetailSensorsUsable'),
  wardDetailCritical: document.getElementById('wardDetailCritical'),
  wardDetailConfidence: document.getElementById('wardDetailConfidence'),
  wardDetailAvgDrop: document.getElementById('wardDetailAvgDrop'),
  wardDetailMaxDrop: document.getElementById('wardDetailMaxDrop'),
  wardDetailDropSensors: document.getElementById('wardDetailDropSensors'),
  wardInlineCharts: document.getElementById('wardInlineCharts'),
  wardDetailPumping: document.getElementById('wardDetailPumping'),
  wardDetailPerformance: document.getElementById('wardDetailPumpingPerformance'),
  wardDetailConsumption: document.getElementById('wardDetailConsumption'),
  closeDetails: document.getElementById('closeDetails'),
  app: document.getElementById('app'),
  toggleLeft: document.getElementById('toggleLeft'),
  toggleRight: document.getElementById('toggleRight'),
  chartFullscreen: document.getElementById('chartFullscreen'),
  chartFullscreenTitle: document.getElementById('chartFullscreenTitle'),
  chartFullscreenCanvas: document.getElementById('chartFullscreenCanvas'),
  chartFullscreenControls: document.getElementById('chartFullscreenControls'),
  chartFullscreenClose: document.getElementById('chartFullscreenClose'),
  downloadWaterChart: document.getElementById('downloadWaterChart'),
  downloadDischargeChart: document.getElementById('downloadDischargeChart')
};

