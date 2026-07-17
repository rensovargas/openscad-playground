import { Button } from 'primereact/button';
import { Slider } from 'primereact/slider';
import { MeasureState, SectionState } from '../viewer/section-measure-types';

interface MeasureSectionSidebarProps {
  measureEnabled: boolean;
  measureState: MeasureState;
  onClearMeasure: () => void;
  sectionEnabled: boolean;
  sectionState: SectionState;
  sectionRadius: number;
  onSectionOffsetChange: (offset: number) => void;
  onResetSection: () => void;
}

function formatPoint(p: [number, number, number] | null): string {
  if (!p) return '—';
  return `${p[0].toFixed(2)}, ${p[1].toFixed(2)}, ${p[2].toFixed(2)}`;
}

export default function MeasureSectionSidebar({
  measureEnabled,
  measureState,
  onClearMeasure,
  sectionEnabled,
  sectionState,
  sectionRadius,
  onSectionOffsetChange,
  onResetSection,
}: MeasureSectionSidebarProps) {
  if (!measureEnabled && !sectionEnabled) return null;

  return (
    <div style={{
      width: '200px',
      padding: '10px',
      overflow: 'auto',
      borderLeft: '1px solid rgba(128,128,128,0.3)',
      fontSize: '12px',
    }}>
      {measureEnabled && (
        <>
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
        </>
      )}
      {sectionEnabled && (
        <>
          <h4 style={{ marginTop: 0 }}>Section</h4>
          <div>Normal: {formatPoint(sectionState.normal)}</div>
          <div style={{ margin: '10px 0' }}>
            <div>Offset: {sectionState.offset.toFixed(2)}</div>
            <Slider
              style={{ marginTop: '6px' }}
              value={sectionState.offset}
              min={-sectionRadius}
              max={sectionRadius}
              step={sectionRadius / 100}
              onChange={(e) => onSectionOffsetChange(e.value as number)}
            />
          </div>
          <Button
            label="Reset plane"
            className="p-button-text p-button-sm"
            onClick={onResetSection}
          />
        </>
      )}
    </div>
  );
}
