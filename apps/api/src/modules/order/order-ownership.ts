import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db/client";
import { shopeeOrders } from "../../db/schema";

/**
 * orderSn bersifat globally unique (uniq_order_sn), sehingga satu lookup yang
 * di-scope companyId adalah gate kepemilikan lintas-tenant yang otoritatif untuk
 * semua endpoint yang me-resolve order dari orderSn.
 */
export async function isOrderOwnedByCompany(
	orderSn: string,
	companyId: number,
): Promise<boolean> {
	const rows = await db
		.select({ orderSn: shopeeOrders.orderSn })
		.from(shopeeOrders)
		.where(
			and(
				eq(shopeeOrders.orderSn, orderSn),
				eq(shopeeOrders.companyId, companyId),
			),
		)
		.limit(1);
	return rows.length > 0;
}

/**
 * Mengembalikan subset orderSns (sebagai Set) yang dimiliki companyId. Satu query.
 */
export async function filterOrderSnsOwnedByCompany(
	orderSns: string[],
	companyId: number,
): Promise<Set<string>> {
	const unique = [...new Set(orderSns)];
	if (unique.length === 0) return new Set();
	const rows = await db
		.select({ orderSn: shopeeOrders.orderSn })
		.from(shopeeOrders)
		.where(
			and(
				inArray(shopeeOrders.orderSn, unique),
				eq(shopeeOrders.companyId, companyId),
			),
		);
	return new Set(rows.map((r) => r.orderSn));
}
