import type { ReactNode } from 'react';
import { cn } from '@/lib/utils.js';
import { FieldGroup, FieldLegend, FieldSet } from './ui/field.js';
import { ItemContent, ItemDescription, ItemTitle } from './ui/item.js';

export type FormSection = {
  title: string;
  description?: string;
  fields: ReactNode[];
  layout?: 'horizontal' | 'vertical';
};

type DefaultFormLayoutProps = {
  sections: FormSection[];
  layout?: 'horizontal' | 'vertical';
};

// Porte de ../IOT/iotlog-frontend-v2/src/components/default-form-layout.tsx
// — cada seção vira um FieldSet com um título + subtítulo (description) à
// esquerda e os campos em grid à direita (layout 'horizontal', o default) ou
// empilhados (`vertical`). Export nomeado (não default): convenção do
// projeto, mesma família de default-empty-data.tsx/default-loading.tsx.
export function DefaultFormLayout({ sections, layout = 'horizontal' }: DefaultFormLayoutProps) {
  return (
    <div className="flex flex-col gap-8">
      {sections.map((section, index) => {
        const sectionLayout = section.layout || layout;
        const isLast = index === sections.length - 1;
        return (
          <FieldSet
            // biome-ignore lint/suspicious/noArrayIndexKey: `sections` é lista estática do caller, nunca reordenada.
            key={`${section.title}-${index}`}
            className={cn(
              'block w-full p-0',
              !isLast && 'border-border/60 border-b border-dashed pb-8',
              sectionLayout === 'horizontal' ? 'grid grid-cols-1 gap-8 md:grid-cols-3' : 'flex flex-col gap-6',
            )}
          >
            <ItemContent className="gap-1">
              <FieldLegend variant="label" className="m-0 p-0">
                <ItemTitle className="font-medium text-base">{section.title}</ItemTitle>
              </FieldLegend>
              {section.description && (
                <ItemDescription className="line-clamp-none">{section.description}</ItemDescription>
              )}
            </ItemContent>

            <div className={cn(sectionLayout === 'horizontal' && 'md:col-span-2')}>
              <FieldGroup className="grid grid-cols-1 gap-6 sm:grid-cols-6">
                {section.fields.map((field, fieldIndex) => (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: `fields` é lista estática do caller, nunca reordenada.
                    key={`${section.title}-${fieldIndex}`}
                    className="col-span-full"
                  >
                    {field}
                  </div>
                ))}
              </FieldGroup>
            </div>
          </FieldSet>
        );
      })}
    </div>
  );
}
