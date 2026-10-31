import { ToastStack, ToastStackProvider } from '@/components/arc/toast-stack/toast-stack';
import { ContextMenuDemo, HoldToConfirmDemo } from './ui-lab/ActionSections';
import {
  BadgeSection,
  ButtonSection,
  DialogToastSection,
  InputSection,
  ProgressSection,
  TabsSection,
  TokenSection,
  TypographySection,
} from './ui-lab/FoundationSections';
import {
  ButtonGroupDemo,
  CheckboxDemo,
  ChipGroupDemo,
  ComboboxDemo,
  CopyButtonDemo,
  FieldLabelDemo,
  NumberFieldDemo,
  PasswordFieldDemo,
  RadioCardsDemo,
  RadioGroupDemo,
  SearchFieldDemo,
  SegmentedControlDemo,
  TextareaDemo,
} from './ui-lab/InputSections';
import {
  BreadcrumbDemo,
  CommandPaletteDemo,
  DrawerDemo,
  DropdownMenuDemo,
  PaginationDemo,
  PopoverDemo,
  StepperDemo,
  TooltipDemo,
  TreeViewDemo,
} from './ui-lab/NavigationSections';
import {
  AlertDemo,
  CardDemo,
  CodeBlockDemo,
  EmptyLineDemo,
  LineChartDemo,
  MetricCardDemo,
  ScrollAreaDemo,
  SkeletonDemo,
  SortableTableDemo,
} from './ui-lab/DataSections';
import { LabSection } from './ui-lab/shared';

/* Dev-only evaluation page for the Arc components. Reached from the command palette in dev builds. */

export default function UiLabView() {
  return (
    <ToastStackProvider>
      <div data-testid="ui-lab" className="relative flex h-full min-h-0 flex-col">
        <div className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto p-6">
          <header className="flex flex-col gap-1">
            <h1 className="text-[length:var(--text-2xl)] font-semibold text-[var(--foreground)]">
              UI Lab
            </h1>
            <p className="text-sm text-[var(--text-muted)]">
              Arc UI の評価用ページです（開発ビルドのみ）。
            </p>
          </header>

          <LabSection title="Tokens">
            <TokenSection />
          </LabSection>
          <LabSection title="Typography">
            <TypographySection />
          </LabSection>
          <LabSection title="Buttons">
            <ButtonSection />
          </LabSection>
          <LabSection title="Inputs">
            <InputSection />
          </LabSection>
          <LabSection title="Tabs">
            <TabsSection />
          </LabSection>
          <LabSection title="Badge">
            <BadgeSection />
          </LabSection>
          <LabSection title="Progress">
            <ProgressSection />
          </LabSection>
          <LabSection title="Dialog / Toast">
            <DialogToastSection />
          </LabSection>

          <LabSection title="Field label and hint">
            <FieldLabelDemo />
          </LabSection>
          <LabSection title="Segmented control">
            <SegmentedControlDemo />
          </LabSection>
          <LabSection title="Chip group">
            <ChipGroupDemo />
          </LabSection>
          <LabSection title="Password field">
            <PasswordFieldDemo />
          </LabSection>
          <LabSection title="Number field">
            <NumberFieldDemo />
          </LabSection>
          <LabSection title="Combobox">
            <ComboboxDemo />
          </LabSection>
          <LabSection title="Radio cards">
            <RadioCardsDemo />
          </LabSection>
          <LabSection title="Radio group">
            <RadioGroupDemo />
          </LabSection>
          <LabSection title="Checkbox">
            <CheckboxDemo />
          </LabSection>
          <LabSection title="Textarea">
            <TextareaDemo />
          </LabSection>
          <LabSection title="Search field">
            <SearchFieldDemo />
          </LabSection>
          <LabSection title="Copy button">
            <CopyButtonDemo />
          </LabSection>
          <LabSection title="Button group">
            <ButtonGroupDemo />
          </LabSection>

          <LabSection title="Breadcrumb">
            <BreadcrumbDemo />
          </LabSection>
          <LabSection title="Pagination">
            <PaginationDemo />
          </LabSection>
          <LabSection title="Stepper">
            <StepperDemo />
          </LabSection>
          <LabSection title="Tree view">
            <TreeViewDemo />
          </LabSection>
          <LabSection title="Dropdown menu">
            <DropdownMenuDemo />
          </LabSection>
          <LabSection title="Popover">
            <PopoverDemo />
          </LabSection>
          <LabSection title="Tooltip">
            <TooltipDemo />
          </LabSection>
          <LabSection title="Drawer">
            <DrawerDemo />
          </LabSection>
          <LabSection title="Command palette">
            <CommandPaletteDemo />
          </LabSection>

          <LabSection title="Sortable data table">
            <SortableTableDemo />
          </LabSection>
          <LabSection title="Line chart">
            <LineChartDemo />
          </LabSection>
          <LabSection title="Metric card">
            <MetricCardDemo />
          </LabSection>
          <LabSection title="Code block">
            <CodeBlockDemo />
          </LabSection>
          <LabSection title="Card">
            <CardDemo />
          </LabSection>
          <LabSection title="Scroll area">
            <ScrollAreaDemo />
          </LabSection>
          <LabSection title="Empty line">
            <EmptyLineDemo />
          </LabSection>
          <LabSection title="Skeleton">
            <SkeletonDemo />
          </LabSection>
          <LabSection title="Alert">
            <AlertDemo />
          </LabSection>

          <LabSection title="Context menu">
            <ContextMenuDemo />
          </LabSection>
          <LabSection title="Hold to confirm">
            <HoldToConfirmDemo />
          </LabSection>
        </div>
        <ToastStack label="UI Lab の通知" contained />
      </div>
    </ToastStackProvider>
  );
}
