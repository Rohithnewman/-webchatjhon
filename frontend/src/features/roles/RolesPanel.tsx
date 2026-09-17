import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";

import { PERMISSION_CATALOGUE, workspaceApi, type Role } from "../../entities/workspace/api";
import { Badge, Button, Field, Input, LoadingState, Panel, useToast } from "../../shared/ui";

function permissionsEqual(a: string[], b: string[]): boolean {
  const setA = new Set(a);
  const setB = new Set(b);
  return setA.size === setB.size && [...setA].every((p) => setB.has(p));
}

const CATALOGUE_IDS = new Set(PERMISSION_CATALOGUE.map((p) => p.id));

/** A role's GET response includes the server-added `features:read` (D3: it
 *  is implied for every role). Strip it — and anything else outside the
 *  editable catalogue — before sending permissions back on create/update;
 *  the server re-adds it itself. */
function toCatalogueOnly(permissions: string[]): string[] {
  return permissions.filter((p) => CATALOGUE_IDS.has(p));
}

function PermissionGrid({
  selected,
  disabled,
  onToggle,
}: {
  selected: string[];
  disabled?: boolean;
  onToggle: (permission: string, checked: boolean) => void;
}) {
  return (
    <div className="permission-grid">
      {PERMISSION_CATALOGUE.map((perm) => (
        <label key={perm.id} className="permission-check">
          <input
            type="checkbox"
            disabled={disabled}
            checked={selected.includes(perm.id)}
            onChange={(e) => onToggle(perm.id, e.target.checked)}
          />
          {perm.label}
        </label>
      ))}
    </div>
  );
}

/** Settings → Roles: every organisation's roles (the four system roles plus
 *  its own), a checkbox grid over the fixed permission catalogue to define
 *  new ones, and inline rename/re-permission/delete for the organisation's
 *  own roles. System roles are read-only here (the API refuses to change
 *  them with 403 SYSTEM_ROLE). */
export function RolesPanel() {
  const toast = useToast();
  const client = useQueryClient();
  const roles = useQuery({ queryKey: ["roles"], queryFn: workspaceApi.roles });

  const [newName, setNewName] = useState("");
  const [newPermissions, setNewPermissions] = useState<string[]>([]);

  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["roles"] });
    // A role's name shows up in the team's role picker too.
    void client.invalidateQueries({ queryKey: ["members"] });
  };
  const fail = (err: unknown) => toast.error(err instanceof Error ? err.message : "Request failed");

  const create = useMutation({
    mutationFn: () => workspaceApi.createRole({ name: newName.trim(), permissions: toCatalogueOnly(newPermissions) }),
    onSuccess: () => {
      setNewName("");
      setNewPermissions([]);
      refresh();
      toast.success("Role created");
    },
    onError: fail,
  });

  const remove = useMutation({
    mutationFn: (roleId: string) => workspaceApi.deleteRole(roleId),
    onSuccess: () => { refresh(); toast.success("Role deleted"); },
    onError: fail,
  });

  if (roles.isLoading) return <LoadingState label="Loading roles" />;

  return (
    <div className="settings-grid">
      <Panel>
        <Panel.Header title="Create a role" />
        <Panel.Body>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              if (newName.trim()) create.mutate();
            }}
          >
            <Field label="Name">
              <Input
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Support agent"
              />
            </Field>
            <Field label="Permissions">
              <PermissionGrid
                selected={newPermissions}
                onToggle={(permission, checked) =>
                  setNewPermissions((prev) =>
                    checked ? [...prev, permission] : prev.filter((p) => p !== permission),
                  )
                }
              />
            </Field>
            <p className="form-hint">
              Every role can read (features:read is always included). Leave every box unchecked for a read-only role.
            </p>
            <Button
              type="submit"
              variant="primary"
              icon={<Plus size={15} />}
              loading={create.isPending}
              disabled={!newName.trim() || create.isPending}
            >
              Create role
            </Button>
          </form>
        </Panel.Body>
      </Panel>

      <Panel>
        <Panel.Header title={`Roles (${roles.data?.length ?? 0})`} />
        <Panel.Body flush>
          {(roles.data ?? []).map((role) => (
            <RoleRow
              key={role.id}
              role={role}
              onDelete={() => remove.mutate(role.id)}
              deleting={remove.isPending && remove.variables === role.id}
            />
          ))}
        </Panel.Body>
      </Panel>
    </div>
  );
}

function RoleRow({ role, onDelete, deleting }: { role: Role; onDelete: () => void; deleting: boolean }) {
  const toast = useToast();
  const client = useQueryClient();
  const [name, setName] = useState(role.name);
  const [permissions, setPermissions] = useState<string[]>(role.permissions);

  const dirty = name !== role.name || !permissionsEqual(permissions, role.permissions);

  const save = useMutation({
    mutationFn: () => workspaceApi.updateRole(role.id, { name, permissions: toCatalogueOnly(permissions) }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["roles"] });
      void client.invalidateQueries({ queryKey: ["members"] });
      toast.success("Role updated");
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Request failed"),
  });

  return (
    <div className="role-row">
      <div className="role-row-header">
        {role.is_system ? (
          <strong style={{ textTransform: "none" }}>{role.name}</strong>
        ) : (
          <Input value={name} onChange={(e) => setName(e.target.value)} aria-label={`Name for ${role.name}`} />
        )}
        {role.is_system && <Badge>system</Badge>}
        <span className="credential-meta">
          {role.in_use} member{role.in_use === 1 ? "" : "s"} assigned
        </span>
        {!role.is_system && (
          <div className="role-row-actions">
            {dirty && (
              <Button size="sm" variant="primary" icon={<Save size={14} />} loading={save.isPending} onClick={() => save.mutate()}>
                Save
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash2 size={14} />}
              loading={deleting}
              onClick={() => {
                if (window.confirm(`Delete the "${role.name}" role?`)) onDelete();
              }}
            >
              Delete
            </Button>
          </div>
        )}
      </div>
      <PermissionGrid
        selected={permissions}
        disabled={role.is_system}
        onToggle={(permission, checked) =>
          setPermissions((prev) => (checked ? [...prev, permission] : prev.filter((p) => p !== permission)))
        }
      />
    </div>
  );
}
