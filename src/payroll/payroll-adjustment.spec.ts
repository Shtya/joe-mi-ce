import { PayrollAdjustment } from "entities/payroll/payroll-adjustment.entity";
import { PayrollLine } from "entities/payroll/payroll-line.entity";
import { PayrollOvertime } from "entities/payroll/payroll-overtime.entity";
import { PayrollAdjustmentType, PayrollPeriodStatus } from "./payroll.types";
import { PayrollService } from "./payroll.service";

describe("PayrollService employee adjustments", () => {
  const projectId = "4e091f2c-8352-4cc5-b42d-cff999cd9c69";
  const lineId = "64070150-ecea-4ddb-b615-69b07f68da75";
  const actor = {
    id: "f95d09e7-b06c-4c53-b071-086a74b4fbf5",
    project_id: projectId,
    role: {
      name: "admin",
      hasPermission: () => true,
    },
  };

  function createService(
    status = PayrollPeriodStatus.PENDING,
    automaticOvertimeAmount = 0,
  ) {
    const adjustments: PayrollAdjustment[] = [];
    const line = Object.assign(new PayrollLine(), {
      id: lineId,
      periodId: "359622d5-a300-41d0-b35f-c3e120d4a31c",
      grossSalary: "4500.00",
      salarySnapshot: "4500.00",
      attendanceDeduction: "0.00",
      manualDeduction: "0.00",
      automaticOvertimeAddition: automaticOvertimeAmount.toFixed(2),
      totalAddition: "0.00",
      totalDeduction: "0.00",
      netPay: "4500.00",
      period: { projectId, status },
      adjustments,
    });

    const manager = {
      findOne: jest.fn(async (entity: unknown) => {
        if (entity === PayrollLine) return line;
        return null;
      }),
      find: jest.fn(async (entity: unknown) => {
        if (entity === PayrollAdjustment) return adjustments;
        if (entity === PayrollOvertime)
          return automaticOvertimeAmount > 0
            ? [{ lineId, amount: automaticOvertimeAmount.toFixed(2) }]
            : [];
        return [];
      }),
      create: jest.fn((_entity: unknown, value: object) => value),
      save: jest.fn(async (entityOrValue: unknown, maybeValue?: any) => {
        const value = maybeValue ?? entityOrValue;
        if ("type" in value && "amount" in value) {
          Object.assign(value, { id: `adjustment-${adjustments.length + 1}` });
          adjustments.push(value);
        }
        return value;
      }),
    };
    const dataSource = {
      transaction: jest.fn(async (callback: (manager: any) => unknown) =>
        callback(manager),
      ),
    };
    const service = new PayrollService(
      dataSource as any,
      {
        findOne: jest.fn(async () => ({ id: projectId, payrollEnabled: true })),
      } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    return { service, line };
  }

  it("recalculates net pay from multiple additions and deductions", async () => {
    const { service, line } = createService();

    await service.addAdjustment(
      lineId,
      {
        type: PayrollAdjustmentType.ADDITION,
        amount: 300,
        reason: "Commission",
      },
      actor as any,
    );
    await service.addAdjustment(
      lineId,
      {
        type: PayrollAdjustmentType.DEDUCTION,
        amount: 100,
        reason: "Advance",
      },
      actor as any,
    );

    expect(line.totalAddition).toBe("300.00");
    expect(line.manualDeduction).toBe("100.00");
    expect(line.totalDeduction).toBe("100.00");
    expect(line.netPay).toBe("4700.00");
  });

  it("preserves automatic overtime when recalculating manual additions", async () => {
    const { service, line } = createService(PayrollPeriodStatus.PENDING, 30);

    await service.addAdjustment(
      lineId,
      {
        type: PayrollAdjustmentType.ADDITION,
        amount: 300,
        reason: "Commission",
      },
      actor as any,
    );

    expect(line.automaticOvertimeAddition).toBe("30.00");
    expect(line.totalAddition).toBe("330.00");
    expect(line.netPay).toBe("4830.00");
  });

  it("caps net pay at zero when deductions exceed gross salary", async () => {
    const { service, line } = createService();

    await service.addAdjustment(
      lineId,
      {
        type: PayrollAdjustmentType.DEDUCTION,
        amount: 5000,
        reason: "Advance",
      },
      actor as any,
    );

    expect(line.totalDeduction).toBe("5000.00");
    expect(line.netPay).toBe("0.00");
  });

  it("does not allow adjustments after payroll is paid", async () => {
    const { service } = createService(PayrollPeriodStatus.PAID);

    await expect(
      service.addAdjustment(
        lineId,
        {
          type: PayrollAdjustmentType.ADDITION,
          amount: 25,
          reason: "Allowance",
        },
        actor as any,
      ),
    ).rejects.toThrow("Paid payroll periods are locked");
  });
});
