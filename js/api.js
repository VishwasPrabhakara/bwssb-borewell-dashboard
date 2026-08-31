/* ==========================================================================
   BBMP Borewell Dashboard - REST API Data Fetching & Sync Services
   ========================================================================== */

    const fetchJsonWithRetry = async (url, fallback, retries = 1) => {
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
          const separator = url.includes('?') ? '&' : '?';
          const bust = attempt ? `${separator}retry=${Date.now()}` : '';
          const response = await fetch(`${url}${bust}`);
          if (response.ok) return response.json();
          if (attempt === retries) {
            console.warn(`[API] Endpoint request failed (${response.status}): ${url}`);
            return fallback;
          }
        } catch (error) {
          if (attempt === retries) {
            console.warn(`[API Network Error] ${error.message} when calling ${url}`);
            return fallback;
          }
        }
      }
      return fallback;
    };

    const loadWardSpecificCapacity = async (wardNo) => {
      const base = `${API_BASE_URL}/api/specific-capacity/ward?ward_no=${encodeURIComponent(wardNo)}`;
      const fetchCapacity = async (extraQuery) => {
        const response = await fetch(`${base}&cache_v=${SPECIFIC_CAPACITY_API_VERSION}${extraQuery || ''}`);
        if (!response.ok) {
          return { ward: null, sensors: [], loadError: `Specific capacity API returned HTTP ${response.status}.` };
        }
        return response.json();
      };

      try {
        const payload = await fetchCapacity('');
        window.__lastSpecificCapacityPayload = { wardNo, payload };
        if (hasValidSpecificCapacity(payload.ward) || (payload.sensors || []).length || payload.loadError) return payload;
        const retryPayload = await fetchCapacity(`&retry=${Date.now()}`);
        window.__lastSpecificCapacityPayload = { wardNo, payload: retryPayload, retried: true };
        return retryPayload;
      } catch (error) {
        const errorPayload = {
          ward: null,
          sensors: [],
          loadError: error?.message || 'Specific capacity API request failed.'
        };
        window.__lastSpecificCapacityPayload = { wardNo, payload: errorPayload, error: true };
        return errorPayload;
      }
    };

    const loadWardPumpingPerformance = async (wardNo) => {
      const key = normalizeWardNo(wardNo);
      if (pumpingPerformanceByWardNo.has(key)) return pumpingPerformanceByWardNo.get(key);
      const url = `${API_BASE_URL}/api/pumping-performance/ward?ward_no=${encodeURIComponent(wardNo)}&cache_v=${PUMPING_PERFORMANCE_API_VERSION}`;
      try {
        const response = await fetch(url);
        if (!response.ok) {
          return { ward: null, sensors: [], loadError: `Pumping performance API returned HTTP ${response.status}.` };
        }
        const payload = await response.json();
        pumpingPerformanceByWardNo.set(key, payload);
        return payload;
      } catch (error) {
        return {
          ward: null,
          sensors: [],
          loadError: error?.message || 'Pumping performance API request failed.'
        };
      }
    };

    const buildChart = (canvasId, existing, labels, values, label, color, options = {}) => {
      if (existing) existing.destroy();
      const canvas = document.getElementById(canvasId);
      canvas.style.width = '100%';
      const chartValue = (value) => value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(Number(value).toFixed(2)) : null;
      const rotateLabels = Boolean(options.rotateXLabels);
      return new Chart(document.getElementById(canvasId), {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label,
            data: values.map(chartValue),
            borderColor: color,
            backgroundColor: color + '22',
            borderWidth: 2,
            pointRadius: 2,
            pointHoverRadius: 4,
            tension: 0.25,
            unit: options.unit || ''
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { ticks: { minRotation: rotateLabels ? 90 : 0, maxRotation: rotateLabels ? 90 : 0, autoSkip: true, maxTicksLimit: rotateLabels ? 12 : 6 } },
            y: { reverse: !!options.reverseY, title: { display: true, text: options.yTitle || '' } }
          },
        plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const value = context.parsed.y;
                  if (value === null || value === undefined) return `${context.dataset.label}: N/A`;
                  const unit = options.unit ? ` ${options.unit}` : '';
                  return `${context.dataset.label}: ${value.toFixed(2)}${unit}`;
                }
              }
            }
          }
        }
      });
    };

    const buildMultiChart = (canvasId, existing, labels, datasets, options = {}) => {
      if (existing) existing.destroy();
      const canvas = document.getElementById(canvasId);
      canvas.style.width = '100%';
      const chartValue = (value) => {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const y = Number(value.y);
          return Number.isFinite(y) ? { ...value, y: Number(y.toFixed(2)) } : { ...value, y: null };
        }
        return value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(Number(value).toFixed(2)) : null;
      };
      const rotateLabels = Boolean(options.rotateXLabels);
      return new Chart(document.getElementById(canvasId), {
        type: 'line',
        data: {
          labels,
          datasets: datasets.map((dataset) => ({
            ...dataset,
            data: (dataset.data || []).map(chartValue),
            backgroundColor: dataset.borderColor + '22',
            borderWidth: dataset.borderWidth ?? 2,
            pointRadius: dataset.pointRadius ?? 2,
            pointHoverRadius: dataset.pointHoverRadius ?? 4,
            tension: dataset.tension ?? 0.25,
            spanGaps: dataset.spanGaps ?? false
          }))
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              type: options.xType === 'linear-time' ? 'linear' : options.xType || 'category',
              ticks: {
                minRotation: rotateLabels ? 90 : 0,
                maxRotation: rotateLabels ? 90 : 0,
                autoSkip: true,
                maxTicksLimit: rotateLabels ? 12 : 6,
                callback(value) {
                  if (options.xType === 'linear-time') {
                    return new Date(Number(value)).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
                  }
                  return this.getLabelForValue(value);
                }
              }
            },
            y: {
              reverse: !!options.reverseY,
              title: {
                display: true,
                text: options.yTitle || ''
              }
            }
          },
          plugins: {
            legend: {
              display: true,
              labels: {
                usePointStyle: true,
                boxWidth: 16,
                boxHeight: 10
              }
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const value = context.parsed.y;

                  if (value === null || value === undefined) {
                    return `${context.dataset.label}: N/A`;
                  }

                  const unit = context.dataset.unit || options.unit || '';
                  return `${context.dataset.label}: ${value.toFixed(2)}${unit ? ` ${unit}` : ''}`;
                },
                title(context) {
                  const raw = context[0]?.raw || {};
                  if (options.xType === 'linear-time' && Number.isFinite(Number(raw.x))) {
                    return raw.label || new Date(Number(raw.x)).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
                  }
                  return context[0]?.label || '';
                }
              }
            }
          }
        }
      });
    };

    const validChartLevel = (value) => {
      const number = Number(value);
      return Number.isFinite(number) && number > 0;
    };
    const medianValue = (values) => {
      const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
      if (!sorted.length) return null;
      const middle = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    };
    const localMedianValue = (points, index, radius, key) => {
      const start = Math.max(0, index - radius);
      const end = Math.min(points.length, index + radius + 1);
      return medianValue(points.slice(start, end).map((point) => Number(point[key])));
    };
    const localMadValue = (points, index, radius, key, center) => {
      const start = Math.max(0, index - radius);
      const end = Math.min(points.length, index + radius + 1);
      return medianValue(points.slice(start, end).map((point) => Math.abs(Number(point[key]) - center)));
    };
    const smoothExpectedValue = (points, index, radius, key) => {
      const previous = [];
      const next = [];
      for (let cursor = index - 1; cursor >= 0 && previous.length < radius; cursor -= 1) previous.push(points[cursor]);
      for (let cursor = index + 1; cursor < points.length && next.length < radius; cursor += 1) next.push(points[cursor]);
      return medianValue(previous.concat(next).map((point) => Number(point[key])));
    };
    const cleanShortChartSeries = (points, key) => {
      if (points.length < 2) return points;
      const jumpLimit = 80;
      if (points.length === 2) {
        return Math.abs(Number(points[1][key]) - Number(points[0][key])) > jumpLimit ? [] : points;
      }

      let cleaned = points.slice();
      let changed = true;
      while (changed && cleaned.length >= 3) {
        changed = false;
        const firstJump = Math.abs(Number(cleaned[1][key]) - Number(cleaned[0][key]));
        const secondJump = Math.abs(Number(cleaned[2][key]) - Number(cleaned[1][key]));
        const firstToThird = Math.abs(Number(cleaned[2][key]) - Number(cleaned[0][key]));
        if (firstJump > jumpLimit && secondJump <= jumpLimit) {
          cleaned = cleaned.slice(1);
          changed = true;
          continue;
        }
        if (firstJump > jumpLimit && firstToThird <= jumpLimit) {
          cleaned.splice(1, 1);
          changed = true;
          continue;
        }

        const last = cleaned.length - 1;
        const lastJump = Math.abs(Number(cleaned[last][key]) - Number(cleaned[last - 1][key]));
        const previousJump = Math.abs(Number(cleaned[last - 1][key]) - Number(cleaned[last - 2][key]));
        const lastToPreviousPrevious = Math.abs(Number(cleaned[last][key]) - Number(cleaned[last - 2][key]));
        if (lastJump > jumpLimit && previousJump <= jumpLimit) {
          cleaned = cleaned.slice(0, last);
          changed = true;
          continue;
        }
        if (lastJump > jumpLimit && lastToPreviousPrevious <= jumpLimit) {
          cleaned.splice(last - 1, 1);
          changed = true;
        }
      }

      if (cleaned.length === 2 && Math.abs(Number(cleaned[1][key]) - Number(cleaned[0][key])) > jumpLimit) return [];
      return cleaned;
    };
    const dominantContinuousChartSegment = (points, key) => {
      if (points.length < 3) return [];
      const jumpLimit = 80;
      const segments = [];
      let current = [points[0]];
      for (let index = 1; index < points.length; index += 1) {
        const previous = points[index - 1];
        const point = points[index];
        if (Math.abs(Number(point[key]) - Number(previous[key])) > jumpLimit) {
          segments.push(current);
          current = [point];
        } else {
          current.push(point);
        }
      }
      segments.push(current);
      if (segments.length === 1) return points;
      segments.sort((a, b) => {
        if (b.length !== a.length) return b.length - a.length;
        return new Date(b[b.length - 1].time) - new Date(a[a.length - 1].time);
      });
      return segments[0].length >= 3 ? segments[0] : [];
    };
    const cleanChartPointGroups = (rawPoints) => {
      const normalized = rawPoints.map((point) => {
        const waterLevel = validChartLevel(point.waterLevel) ? Number(point.waterLevel) : null;
        const offLevel = validChartLevel(point.offLevel) ? Number(point.offLevel) : null;
        const onLevel = validChartLevel(point.onLevel) ? Number(point.onLevel) : null;
        const primary = onLevel ?? waterLevel ?? offLevel;
        return { ...point, waterLevel, offLevel, onLevel, primary };
      }).filter((point) => point.primary != null && point.time)
        .sort((a, b) => new Date(a.time) - new Date(b.time));

      const uniqueLevels = new Set(normalized.map((point) => Number(point.primary).toFixed(2)));
      if (normalized.length >= 2 && uniqueLevels.size <= 1) return { all: normalized, cleaned: [], outliers: normalized };

      if (normalized.length < 5) {
        const cleanedShort = dominantContinuousChartSegment(cleanShortChartSeries(normalized, 'primary'), 'primary');
        const kept = new Set(cleanedShort);
        return {
          all: normalized,
          cleaned: cleanedShort,
          outliers: normalized.filter((point) => !kept.has(point))
        };
      }

      const values = normalized.map((point) => point.primary);
      const center = medianValue(values);
      const mad = medianValue(values.map((value) => Math.abs(value - center)));
      const stepMad = medianValue(values.slice(1).map((value, index) => Math.abs(value - values[index])));
      const globalMad = Number.isFinite(mad) && mad > 0 ? mad : Number.isFinite(stepMad) && stepMad > 0 ? stepMad : 10;
      const localRadius = normalized.length >= 9 ? 3 : 2;

      const cleaned = normalized.filter((point, index) => {
        const localCenter = localMedianValue(normalized, index, localRadius, 'primary');
        const localDeviation = localMadValue(normalized, index, localRadius, 'primary', localCenter);
        const localLimit = Math.max(25, (Number.isFinite(localDeviation) && localDeviation > 0 ? localDeviation : globalMad) * 4);
        const failsRollingMedian = Number.isFinite(localCenter) && Math.abs(point.primary - localCenter) > localLimit;

        const smoothCenter = smoothExpectedValue(normalized, index, localRadius, 'primary');
        const smoothLimit = Math.max(35, globalMad * 5);
        const failsSmoothTrend = Number.isFinite(smoothCenter) && Math.abs(point.primary - smoothCenter) > smoothLimit;

        let failsSlopeReversal = false;
        if (index > 0 && index < normalized.length - 1) {
          const previous = normalized[index - 1];
          const next = normalized[index + 1];
          const previousJump = Math.abs(point.primary - previous.primary);
          const nextJump = Math.abs(point.primary - next.primary);
          const neighbourJump = Math.abs(next.primary - previous.primary);
          const jumpLimit = Math.max(40, globalMad * 5);
          const neighbourLimit = Math.max(25, globalMad * 3);
          failsSlopeReversal = previousJump > jumpLimit && nextJump > jumpLimit && neighbourJump <= neighbourLimit;
        }

        const residualLimit = Math.max(50, globalMad * 6);
        const failsHampel = Number.isFinite(center) && Math.abs(point.primary - center) > residualLimit;

        return !(failsRollingMedian || failsSmoothTrend || failsSlopeReversal || failsHampel);
      });
      const kept = new Set(cleaned);
      return {
        all: normalized,
        cleaned,
        outliers: normalized.filter((point) => !kept.has(point))
      };
    };
    const cleanChartPoints = (rawPoints) => cleanChartPointGroups(rawPoints).cleaned;
    const wardLevelStatisticConfig = () => (
      wardLevelStatistic === 'median'
        ? {
          key: 'median',
          title: 'Ward-median Groundwater Trend',
          metricPrefix: 'Ward-median',
          levelLabel: 'Median level',
          noteLabel: 'ward-median',
          emptyLabel: 'ward-median'
        }
        : {
          key: 'average',
          title: 'Ward-average Groundwater Trend',
          metricPrefix: 'Ward-average',
          levelLabel: 'Average level',
          noteLabel: 'ward-average',
          emptyLabel: 'ward-average'
        }
    );
    const prepareWardWeeklyForStatistic = (weekly = [], statistic = wardLevelStatistic) => weekly.map((point) => {
      const selected = statistic === 'median'
        ? point.medianLevel ?? point.averageLevel
        : point.averageLevel;
      return {
        ...point,
        averageLevel: validChartLevel(selected) ? Number(selected) : null,
        selectedLevelStatistic: statistic
      };
    });
    const hasUsableWeeklyLevel = (point) => (
      point?.averageLevel !== null
      && point?.averageLevel !== undefined
      && point?.averageLevel !== ''
      && Number.isFinite(Number(point.averageLevel))
    );
    const cleanWeeklyGroundwater = (weekly = []) => {
      const normalized = weekly.map((point, index) => ({
        ...point,
        _xIndex: Number.isFinite(Number(point._xIndex)) ? Number(point._xIndex) : index,
        averageLevel: validChartLevel(point.averageLevel) ? Number(point.averageLevel) : null
      }));
      const valid = normalized.filter((point) => point.averageLevel != null);
      if (valid.length < 4) {
        return { cleaned: normalized, outliers: [] };
      }

      const values = valid.map((point) => point.averageLevel);
      const center = medianValue(values);
      const mad = medianValue(values.map((value) => Math.abs(value - center)));
      const stepMad = medianValue(values.slice(1).map((value, index) => Math.abs(value - values[index])));
      const baseMad = Number.isFinite(mad) && mad > 0 ? mad : Number.isFinite(stepMad) && stepMad > 0 ? stepMad : 6;
      const outlierIndexes = new Set();

      valid.forEach((point, validIndex) => {
        const previous = valid[validIndex - 1];
        const next = valid[validIndex + 1];
        const neighbours = [previous, next].filter(Boolean);
        const localCenter = medianValue(neighbours.map((item) => item.averageLevel));
        const localLimit = Math.max(30, baseMad * 5);
        const isolatedJump = Number.isFinite(localCenter)
          && Math.abs(point.averageLevel - localCenter) > localLimit
          && neighbours.length === 2
          && Math.abs(previous.averageLevel - next.averageLevel) <= Math.max(25, baseMad * 4);

        const relativeJump = neighbours.some((item) => {
          const smaller = Math.max(Math.min(Math.abs(item.averageLevel), Math.abs(point.averageLevel)), 1);
          const ratio = Math.max(Math.abs(item.averageLevel), Math.abs(point.averageLevel)) / smaller;
          return ratio >= 10 && Math.abs(point.averageLevel - item.averageLevel) >= 50;
        });

        if (isolatedJump || relativeJump) outlierIndexes.add(point._xIndex);
      });

      return {
        cleaned: normalized.map((point) => outlierIndexes.has(point._xIndex) ? { ...point, averageLevel: null, _outlier: true } : point),
        outliers: normalized.filter((point) => outlierIndexes.has(point._xIndex))
      };
    };
