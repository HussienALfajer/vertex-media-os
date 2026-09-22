/**
 * @vertex-os/ui — the business-neutral Vertex design system (docs/DESIGN_SYSTEM.md).
 *
 * Feature code imports only from this entry point (plus `@vertex-os/ui/styles.css` once, in
 * the application stylesheet). Third-party primitives used internally are not re-exported.
 */

// Root, settings and shared runtime services
export {
  UiRoot,
  UiLink,
  useUiSettings,
  useUiMessages,
  useAnnounce,
  type UiRootProps,
  type UiLinkComponent,
  type UiLinkProps,
} from './runtime/ui-root';
export type {
  Density,
  Direction,
  Language,
  Theme,
  ThemePreference,
  UiPreferences,
  UiSettings,
} from './runtime/settings';
export type { UiMessages } from './runtime/messages';
export {
  Bdi,
  LtrText,
  TechnicalId,
  FileName,
  ExactAmount,
  DateText,
  InstantText,
  formatAmount,
  formatDate,
  formatInstant,
  normalizeDigits,
  parseDecimal,
  type DecimalParseResult,
} from './runtime/format';

// Foundations
export { Icon, ICON_NAMES, DIRECTIONAL_ICONS, type IconName, type IconSize } from './icons/icon';
export { TOKEN_CATALOG, type TokenInfo } from './generated/tokens';

// Actions
export {
  Button,
  IconButton,
  ButtonGroup,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
  type IconButtonProps,
  type IconButtonVariant,
} from './components/button';

// Fields and choices
export {
  Field,
  Fieldset,
  ErrorMessage,
  Input,
  Textarea,
  Select,
  SearchInput,
  SEARCH_DEBOUNCE_MS,
  type FieldProps,
  type FieldsetProps,
  type InputProps,
  type InputType,
  type SearchInputProps,
  type SelectProps,
  type TextareaProps,
} from './components/field';
export { Checkbox, Radio, Switch, type CheckboxProps, type SwitchProps } from './components/choice';

// Status and feedback
export {
  Badge,
  StatusIndicator,
  Surface,
  Alert,
  InlineMessage,
  Progress,
  Skeleton,
  LoadingState,
  EmptyState,
  NoResultsState,
  ErrorState,
  SKELETON_DELAY_MS,
  LONG_OPERATION_MS,
  TONE_ICONS,
  type Tone,
  type AlertProps,
  type EmptyStateProps,
  type ErrorStateProps,
  type ProgressProps,
  type StatusIndicatorProps,
} from './components/feedback';
export { Spinner } from './components/spinner';
export {
  useToast,
  TOAST_LIFETIME_MS,
  MAX_VISIBLE_TOASTS,
  type ToastInput,
} from './components/toast';

// Overlays
export {
  Dialog,
  Drawer,
  DialogCancel,
  AlertDialog,
  DropdownMenu,
  Popover,
  type AlertDialogProps,
  type DialogProps,
  type DrawerProps,
  type DropdownMenuProps,
  type MenuItemSpec,
  type PopoverProps,
} from './components/overlays';
export { Tooltip, type TooltipProps } from './components/tooltip';

// Navigation
export {
  Breadcrumb,
  Tabs,
  Pagination,
  SidebarNav,
  PAGE_SIZES,
  type BreadcrumbItem,
  type NavigationGroup,
  type NavigationItem,
  type PageSize,
  type PaginationProps,
  type TabItem,
  type TabsProps,
} from './components/navigation';

// Tables and data-dense workflows
export {
  DataTable,
  TwoLineCell,
  TableToolbar,
  FilterBar,
  BulkActionBar,
  useTableSelection,
  nextSort,
  type ActiveFilter,
  type ColumnKind,
  type DataTableProps,
  type SortDirection,
  type TableColumn,
  type TableSelection,
  type TableSort,
  type TableToolbarProps,
} from './components/table';

// Product patterns and shell
export {
  Page,
  PageHeader,
  RecordHeader,
  FormSection,
  FormActions,
  RequiredNote,
  ErrorSummary,
  DescriptionList,
  Inspector,
  InspectorLayout,
  DisplayPreferences,
  focusPageHeading,
  type DescriptionItem,
  type FormIssue,
  type PageHeaderProps,
  type PageWidth,
  type RecordHeaderProps,
} from './components/patterns';
export { AppShell, type AppShellProps } from './components/shell';
