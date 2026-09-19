import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

/**
 * Chart primitives for the admin pages.
 *
 * All of them share one axis/grid/tooltip treatment so the dashboards read
 * as a single system: hairline grid, no axis lines, muted tick labels, and
 * the burgundy-led series palette from theme.css.
 */

export const SERIES = ['#9b1d30', '#2c5c86', '#b08579', '#2f7d54', '#b26a05', '#6b4a7d'];

const AXIS = {
  stroke: '#9a8a84',
  fontSize: 11,
  tickLine: false,
  axisLine: false,
};

const GRID = { stroke: '#e6dbc9', strokeDasharray: '3 3', vertical: false };

const TOOLTIP = {
  contentStyle: {
    background: '#fff',
    border: '1px solid #e6dbc9',
    borderRadius: 10,
    fontSize: 12,
    boxShadow: '0 2px 8px rgba(74,14,23,0.08)',
  },
  labelStyle: { fontWeight: 650, color: '#2b1f1c', marginBottom: 2 },
  cursor: { fill: 'rgba(155,29,48,0.06)' },
};

/** Filled trend — energy over time. */
export function EnergyAreaChart({ data, xKey = 'label', yKey = 'energy_kwh', height = 260, unit = ' kWh' }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="energyFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#9b1d30" stopOpacity={0.28} />
            <stop offset="100%" stopColor="#9b1d30" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid {...GRID} />
        <XAxis dataKey={xKey} {...AXIS} interval="preserveStartEnd" minTickGap={24} />
        <YAxis {...AXIS} width={52} />
        <Tooltip {...TOOLTIP} formatter={(value) => [`${Number(value).toFixed(3)}${unit}`, 'Energy']} />
        <Area
          type="monotone"
          dataKey={yKey}
          stroke="#9b1d30"
          strokeWidth={2}
          fill="url(#energyFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Grouped bars — booking activity by day. */
export function BookingBarChart({ data, height = 260 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid {...GRID} />
        <XAxis
          dataKey="date"
          {...AXIS}
          tickFormatter={(value) =>
            new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
              weekday: 'short',
            })
          }
        />
        <YAxis {...AXIS} width={34} allowDecimals={false} />
        <Tooltip
          {...TOOLTIP}
          labelFormatter={(value) =>
            new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            })
          }
        />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 6 }} iconType="circle" iconSize={8} />
        <Bar dataKey="approved" name="Approved" stackId="a" fill={SERIES[0]} radius={[0, 0, 0, 0]} />
        <Bar dataKey="pending" name="Pending" stackId="a" fill={SERIES[2]} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Donut — computer status or user role breakdown. */
export function BreakdownDonut({ data, height = 260, unit = '' }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius="58%"
          outerRadius="82%"
          paddingAngle={2}
          stroke="none"
        >
          {data.map((entry, index) => (
            <Cell key={entry.name} fill={entry.color ?? SERIES[index % SERIES.length]} />
          ))}
        </Pie>
        <Tooltip
          {...TOOLTIP}
          cursor={false}
          formatter={(value, name) => [
            `${value}${unit} (${total ? Math.round((value / total) * 100) : 0}%)`,
            name,
          ]}
        />
        <Legend
          wrapperStyle={{ fontSize: 12 }}
          iconType="circle"
          iconSize={8}
          verticalAlign="bottom"
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

/** Simple line — utilisation or temperature history. */
export function TrendLineChart({ data, xKey, lines, height = 260 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey={xKey} {...AXIS} minTickGap={24} />
        <YAxis {...AXIS} width={40} />
        <Tooltip {...TOOLTIP} cursor={{ stroke: '#e6dbc9' }} />
        {lines.length > 1 && (
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 6 }} iconType="circle" iconSize={8} />
        )}
        {lines.map((line, index) => (
          <Line
            key={line.key}
            type="monotone"
            dataKey={line.key}
            name={line.label}
            stroke={line.color ?? SERIES[index % SERIES.length]}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Horizontal ranking bars — top computers or users. */
export function RankingBarChart({ data, xKey = 'value', yKey = 'name', height = 260, unit = '' }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid stroke="#e6dbc9" strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" {...AXIS} />
        <YAxis type="category" dataKey={yKey} {...AXIS} width={80} />
        <Tooltip {...TOOLTIP} formatter={(value) => [`${value}${unit}`, '']} />
        <Bar dataKey={xKey} fill={SERIES[0]} radius={[0, 4, 4, 0]} barSize={14} />
      </BarChart>
    </ResponsiveContainer>
  );
}
