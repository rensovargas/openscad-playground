import { Button } from 'primereact/button';
import { MeasureState } from '../viewer/section-measure-types';

interface MeasureSectionSidebarProps {
  measureEnabled: boolean;
  measureState: MeasureState;
  onClearMeasure: () => void;
  sectionEnabled: boolean;
}

function formatPoint(p: [number, number, number] | null): string {
  if (!p) return '—';
  return `${p[0].toFixed(2)}, ${p[1].toFixed(2)}, ${p[2].toFixed(2)}`;
}

export default function MeasureSectionSidebar({
  measureEnabled,
  measureState,
  onClearMeasure,
}: MeasureSectionSidebarProps) {
  if (!measureEnabled) return null;

  return (
    <div style={{
      width: '200px',
      padding: '10px',
      overflow: 'auto',
      borderLeft: '1px solid rgba(128,128,128,0.3)',
      fontSize: '12px',
    }}>
      <h4 style={{ marginTop: 0 }}>Measure</h4>
      <div>Point A: {formatPoint(measureState.pointA)}</div>
      <div>Point B: {formatPoint(measureState.pointB)}</div>
      <div>Distance: {measureState.distance !== null ? measureState.distance.toFixed(3) : '—'}</div>
      <Button
        label="Clear"
        className="p-button-text p-button-sm"
        style={{ marginTop: '8px' }}
        onClick={onClearMeasure}
      />
    </div>
  );
}
