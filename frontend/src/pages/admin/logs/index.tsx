import { useEffect, useState, type FC } from "react";
import { Table, Tag, Select, DatePicker, Spin, Empty, message } from "antd";
import {
  AuditOutlined,
} from "@ant-design/icons";
import { auditApi } from "@/api/admin/audit";
import type { AuditLogItem } from "@/api/admin/audit";

const { RangePicker } = DatePicker;

const ACTION_COLORS: Record<string, string> = {
  create: "#52c41a",
  update: "#1677ff",
  delete: "#ff4d4f",
  login: "#1677ff",
  logout: "#8c8c8c",
  login_fail: "#faad14",
  register: "#52c41a",
  upload: "#1677ff",
  download: "#13c2c2",
  approve: "#52c41a",
  reject: "#ff4d4f",
  disable: "#faad14",
  enable: "#52c41a",
};

const ACTION_LABELS: Record<string, string> = {
  create: "创建",
  update: "更新",
  delete: "删除",
  login: "登录",
  logout: "登出",
  login_fail: "登录失败",
  register: "注册",
  upload: "上传",
  download: "下载",
  approve: "通过审核",
  reject: "拒绝审核",
  disable: "禁用",
  enable: "启用",
};

const LogsPage: FC = () => {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [action, setAction] = useState<string | undefined>(undefined);
  const [dateRange, setDateRange] = useState<[string, string] | null>(null);

  const load = (p: number) => {
    setLoading(true);
    const params: Record<string, unknown> = { page: p, size: pageSize };
    if (action) params.action = action;
    if (dateRange) {
      params.start = dateRange[0];
      params.end = dateRange[1];
    }

    auditApi.list(params)
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch(() => {
        message.error("加载审计日志失败");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(1);
  }, [action, dateRange]);

  const handlePageChange = (p: number) => {
    setPage(p);
    load(p);
  };

  const columns = [
    {
      title: "时间",
      dataIndex: "created_at",
      key: "created_at",
      width: 180,
      render: (v: string) => new Date(v).toLocaleString("zh-CN"),
    },
    {
      title: "用户",
      dataIndex: "username",
      key: "username",
      width: 120,
    },
    {
      title: "操作",
      dataIndex: "action",
      key: "action",
      width: 120,
      render: (v: string) => (
        <Tag color={ACTION_COLORS[v] || "#8c8c8c"}>
          {ACTION_LABELS[v] || v}
        </Tag>
      ),
    },
    {
      title: "资源",
      key: "resource",
      width: 160,
      render: (_: unknown, record: AuditLogItem) => {
        if (!record.resource_type) return "-";
        return `${record.resource_type}${record.resource_id != null ? ` #${record.resource_id}` : ""}`;
      },
    },
    {
      title: "详情",
      dataIndex: "detail",
      key: "detail",
      ellipsis: true,
    },
    {
      title: "IP",
      dataIndex: "ip",
      key: "ip",
      width: 140,
    },
  ];

  return (
    <div className="w-full max-w-[1600px] mx-auto pt-8 px-6">
      {/* 页头 */}
      <div className="flex items-center gap-2 mb-6">
        <AuditOutlined className="text-[#d4513b] text-2xl" />
        <h2 className="text-[1.125rem] font-600 text-[#1a1a1a] m-0">
          <span className="text-[#d4513b]">|</span> 审计日志
        </h2>
      </div>

      {/* 筛选栏 */}
      <div className="flex items-center gap-3 mb-4">
        <Select
          allowClear
          placeholder="操作类型"
          value={action}
          onChange={(v) => {
            setAction(v);
            setPage(1);
          }}
          style={{ width: 140 }}
          options={Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label }))}
        />
        <RangePicker
          onChange={(_, dateStrings) => {
            if (dateStrings[0] && dateStrings[1]) {
              setDateRange([dateStrings[0], dateStrings[1]]);
            } else {
              setDateRange(null);
            }
            setPage(1);
          }}
        />
      </div>

      {/* 表格 */}
      {loading ? (
        <Spin spinning>
          <div className="min-h-60" />
        </Spin>
      ) : !items.length ? (
        <Empty description="暂无审计日志" />
      ) : (
        <Table
          dataSource={items}
          columns={columns}
          rowKey="id"
          pagination={{
            current: page,
            total,
            pageSize,
            onChange: handlePageChange,
            showTotal: (t: number) => `共 ${t} 条`,
          }}
          size="middle"
          className="bg-white rounded-3"
        />
      )}
    </div>
  );
};

export const page = "LogsPage";
export default LogsPage;
