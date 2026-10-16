import { DashboardRagLabel } from '../role-dashboard.model';

/** Chart + bar colors, kept in one place so RAG reads the same everywhere. */
export const RAG_COLOR_BY_RAG: Record<DashboardRagLabel, string> = {
  Green: '#16a34a',
  Amber: '#d97706',
  Red: '#dc2626',
  NoData: '#94a3b8',
};

export const RAG_COLOR_BY_LABEL: Record<DashboardRagLabel, string> = RAG_COLOR_BY_RAG;
