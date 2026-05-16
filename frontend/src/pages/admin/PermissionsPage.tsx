import { useEffect, useState, type FC } from "react";
import { Table, message } from "antd";
import { adminApi, type PermItem } from "../../api/admin";

const PermissionsPage: FC = () => {
  const [perms, setPerms] = useState<PermItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    adminApi.listPermissions()
      .then(setPerms)
      .catch(() => message.error("加载失败"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: "#3d3630", marginBottom: 24 }}>权限列表</h2>
      <Table
        dataSource={perms}
        rowKey="id"
        loading={loading}
        pagination={false}
        style={{ background: "#fff", borderRadius: 12 }}
        columns={[
          { title: "ID", dataIndex: "id", width: 50 },
          { title: "权限码", dataIndex: "code", width: 200 },
          { title: "名称", dataIndex: "name" },
        ]}
      />
    </div>
  );
};

export default PermissionsPage;
