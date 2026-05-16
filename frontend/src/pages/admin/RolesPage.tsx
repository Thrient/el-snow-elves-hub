import { useEffect, useState, type FC } from "react";
import { Table, Button, Modal, Checkbox, message, Tag } from "antd";
import { SettingOutlined } from "@ant-design/icons";
import { adminApi, type RoleItem, type PermItem } from "../../api/admin";

const RolesPage: FC = () => {
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [allPerms, setAllPerms] = useState<PermItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [editRole, setEditRole] = useState<RoleItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const [r, p] = await Promise.all([adminApi.listRoles(), adminApi.listPermissions()]);
      setRoles(r);
      setAllPerms(p);
    } catch { message.error("加载失败"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openEdit = (role: RoleItem) => {
    setEditRole(role);
    setSelectedIds(allPerms.filter((p) => role.permissions.some((rp) => rp.code === p.code)).map((p) => p.id));
  };

  const savePerms = async () => {
    if (!editRole) return;
    try {
      await adminApi.updateRolePermissions(editRole.id, selectedIds);
      message.success("权限已更新");
      setEditRole(null);
      load();
    } catch { message.error("更新失败"); }
  };

  const hasWildcard = (role: RoleItem) => role.permissions.some((p) => p.code === "*");

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: "#3d3630", marginBottom: 24 }}>角色管理</h2>
      <Table
        dataSource={roles}
        rowKey="id"
        loading={loading}
        pagination={false}
        style={{ background: "#fff", borderRadius: 12 }}
        columns={[
          { title: "ID", dataIndex: "id", width: 50 },
          { title: "角色名", dataIndex: "name", width: 120 },
          { title: "描述", dataIndex: "description", render: (v: string | null) => v || "-" },
          {
            title: "权限", width: 340,
            render: (_: unknown, record: RoleItem) => (
              <span>
                {hasWildcard(record) ? (
                  <Tag color="red">超级管理员（全部权限）</Tag>
                ) : record.permissions.length ? (
                  record.permissions.map((p) => <Tag key={p.code} style={{ fontSize: 10 }}>{p.name}</Tag>)
                ) : (
                  <span style={{ fontSize: 11, color: "#b8afa6" }}>无权限</span>
                )}
              </span>
            ),
          },
          {
            title: "操作", width: 80,
            render: (_: unknown, record: RoleItem) => (
              <Button size="small" type="text" icon={<SettingOutlined />} onClick={() => openEdit(record)}>
                权限
              </Button>
            ),
          },
        ]}
      />

      <Modal
        title={`编辑权限 — ${editRole?.name}`}
        open={!!editRole}
        onCancel={() => setEditRole(null)}
        onOk={savePerms}
        okText="保存"
        cancelText="取消"
        width={420}
      >
        <div style={{ padding: "12px 0" }}>
          <Checkbox
            checked={selectedIds.includes(
              allPerms.find((p) => p.code === "*")?.id ?? -1
            )}
            onChange={(e) => {
              const wildcardId = allPerms.find((p) => p.code === "*")?.id;
              if (!wildcardId) return;
              if (e.target.checked) setSelectedIds([wildcardId]);
              else setSelectedIds([]);
            }}
            style={{ marginBottom: 16, fontWeight: 600 }}
          >
            超级管理员（全部权限）
          </Checkbox>

          <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 16 }}>
            <div style={{ fontSize: 12, color: "#b8afa6", marginBottom: 8 }}>或选择具体权限：</div>
            <Checkbox.Group
              value={selectedIds.includes(
                allPerms.find((p) => p.code === "*")?.id ?? -1
              ) ? [] : selectedIds}
              onChange={(values) => setSelectedIds(values as number[])}
              style={{ display: "flex", flexDirection: "column", gap: 8 }}
            >
              {allPerms.filter((p) => p.code !== "*").map((p) => (
                <Checkbox key={p.id} value={p.id}>
                  <span style={{ fontSize: 13 }}>{p.name}</span>
                  <span style={{ fontSize: 10, color: "#b8afa6", marginLeft: 4 }}>{p.code}</span>
                </Checkbox>
              ))}
            </Checkbox.Group>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default RolesPage;
