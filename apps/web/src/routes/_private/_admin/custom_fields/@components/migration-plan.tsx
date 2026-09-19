import type { FieldDef, MigrationAction, MigrationPlan } from '@crm/contracts';
import type { DestructiveChange } from '@crm/field-engine';
import { ItemDescription, ItemTitle, Panel } from '@/components/ui/item.js';
import { Label } from '@/components/ui/label.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { t } from '@/lib/helpers/translate.helper.js';
import { CHANGE_REASON_KEYS, mapFieldTargets, remainingOptions } from '../@utils/template-form.utils.js';

type MigrationPlanPanelProps = {
  changes: DestructiveChange[];
  originals: FieldDef[];
  next: FieldDef[];
  plan: Partial<MigrationPlan>;
  onChange: (fieldId: string, action: MigrationAction) => void;
};

type SelectItemData = { value: string; label: string };

function PlanSelect({
  items,
  value,
  placeholder,
  onChange,
  label,
}: {
  items: SelectItemData[];
  value: string | undefined;
  placeholder: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <Select items={items} value={value ?? null} onValueChange={(next) => next && onChange(next)}>
      <SelectTrigger className="w-full" aria-label={label}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Mudança destrutiva (campo removido, tipo trocado, opção removida) exige um
// plano por campo antes do bump — o back-end recusa sem ele
// (migration_plan_required). Cada mudança escolhe descartar os valores, movê-
// los para outro campo do mesmo tipo, ou trocar as opções removidas por
// opções que continuam existindo.
export function MigrationPlanPanel({ changes, originals, next, plan, onChange }: MigrationPlanPanelProps) {
  return (
    <Panel className="grid gap-4" data-testid="migration-plan">
      <div className="grid gap-1">
        <ItemTitle>{t('saved_values')}</ItemTitle>
        <ItemDescription>{t('choose_what_to_do_with_saved_values')}</ItemDescription>
      </div>
      {changes.map((change) => {
        const original = originals.find((def) => def.fieldId === change.fieldId);
        const fieldLabel = original?.label ?? change.fieldId;
        const targets = change.reason === 'optionRemoved' ? [] : mapFieldTargets(change, originals, next);
        const options = change.reason === 'optionRemoved' ? remainingOptions(change, next) : [];
        const action = plan[change.fieldId];
        const actionItems: SelectItemData[] = [
          { value: 'discard', label: t('discard_values') },
          ...(targets.length > 0 ? [{ value: 'mapField', label: t('move_to_field') }] : []),
          ...(options.length > 0 ? [{ value: 'mapOptions', label: t('replace_options') }] : []),
        ];
        const optionLabel = (key: string) =>
          (original?.type === 'select' || original?.type === 'status'
            ? original.options.find((option) => option.key === key)?.label
            : undefined) ?? key;

        return (
          <div key={change.fieldId} className="grid gap-2" data-testid={`migration-change-${change.fieldId}`}>
            <Label>
              {fieldLabel} — {t(CHANGE_REASON_KEYS[change.reason])}
              {change.reason === 'optionRemoved' && `: ${change.removedOptions.map(optionLabel).join(', ')}`}
            </Label>
            <PlanSelect
              label={fieldLabel}
              items={actionItems}
              value={action?.action}
              placeholder={t('choose_action')}
              onChange={(value) =>
                onChange(
                  change.fieldId,
                  value === 'mapField'
                    ? { action: 'mapField', toFieldId: '' }
                    : value === 'mapOptions'
                      ? { action: 'mapOptions', mapping: {} }
                      : { action: 'discard' },
                )
              }
            />
            {action?.action === 'mapField' && (
              <PlanSelect
                label={t('choose_field')}
                items={targets.map((def) => ({ value: def.fieldId, label: def.label }))}
                value={action.toFieldId || undefined}
                placeholder={t('choose_field')}
                onChange={(toFieldId) => onChange(change.fieldId, { action: 'mapField', toFieldId })}
              />
            )}
            {action?.action === 'mapOptions' &&
              change.reason === 'optionRemoved' &&
              change.removedOptions.map((removedKey) => (
                <div key={removedKey} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-center gap-2">
                  <ItemDescription>{optionLabel(removedKey)} →</ItemDescription>
                  <PlanSelect
                    label={optionLabel(removedKey)}
                    items={options.map((option) => ({ value: option.key, label: option.label }))}
                    value={action.mapping[removedKey]}
                    placeholder={t('choose_option')}
                    onChange={(key) =>
                      onChange(change.fieldId, {
                        action: 'mapOptions',
                        mapping: { ...action.mapping, [removedKey]: key },
                      })
                    }
                  />
                </div>
              ))}
          </div>
        );
      })}
    </Panel>
  );
}
