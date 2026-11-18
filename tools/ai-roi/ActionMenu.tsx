"use client";
import { Fragment } from "react";
import { ActionMenu as SharedMenu, ActionMenuItem, ActionMenuGroup } from "@/simulator/components/actions/menu";
import styles from "./tool.module.css";
export interface MenuAction { label: string; onClick: () => void; disabled?: boolean; destructive?: boolean; group?: string }
export function ActionMenu({ label, actions }: { label: string; actions: MenuAction[] }) {
  return <SharedMenu label={label} className={styles.menu}>{actions.map((action, index) => <Fragment key={action.label}>
    {action.group && action.group !== actions[index - 1]?.group && <ActionMenuGroup>{action.group}</ActionMenuGroup>}
    <ActionMenuItem disabled={action.disabled} destructive={action.destructive} onClick={action.onClick}>{action.label}</ActionMenuItem>
  </Fragment>)}</SharedMenu>;
}
