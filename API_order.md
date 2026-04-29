*get order list (v2.order.get_order_list)
- GET /api/v2/order/get_order_list :
Use this api to search orders. You may also filter them by status, if needed.
- Common Parameters :
URL : https://partner.shopeemobile.com/api/v2/order/get_order_list
- Request Example (Python) :
import requests

url = "https://partner.shopeemobile.com/api/v2/order/get_order_list?access_token=access_token&cursor=%22%22&order_status=READY_TO_SHIP&page_size=20&partner_id=partner_id&response_optional_fields=order_status&shop_id=shop_id&sign=sign&time_from=1607235072&time_range_field=create_time&time_to=1608271872&timestamp=timestamp"

payload={}
headers = {

}
response = requests.request("GET",url,headers=headers, data=payload, allow_redirects=False)

print(response.text)
- Response Example (JSON) :
{
    "error": "",
    "message": "",
    "response": {
        "more": true,
        "next_cursor":"20",
        "order_list": [
            {
                "order_sn": "201218V2Y6E59M"
            },
            {
                "order_sn": "201218V2W2SG1E"
            },
            {
                "order_sn": "201218V2VJJC70"
            },
            {
                "order_sn": "201218V2TEURPF"
            },
            {
                "order_sn": "201218UXWNTUNP"
            },
            {
                "order_sn": "201218UWFYSCF1"
            },
            {
                "order_sn": "201215MPRFUUNN"
            },
            {
                "order_sn": "201215MCR3V9N8"
            },
            {
                "order_sn": "201214JASXYXY6"
            },
            {
                "order_sn": "201214JAJXU6G7"
            }
        ]
    },
    "request_id": "b937c04e554847789cbf3fe33a0ad5f1"
}
- Error Example (JSON) :
{
    "error": "order.order_list_invalid_time",
    "message": "Start time must be earlier than end time and diff in 15days.",
    "request_id": "2ca3ed1fe1fab0d1e12e5e1efa90e4ac"
}


*get order detail (v2.order.get_order_detail)
- GET /api/v2/order/get_order_detail :
Use this api to get order detail.
- Common Parameters :
URL : https://partner.shopeemobile.com/api/v2/order/get_order_detail
- Request Example (Python) :
import requests

url = "https://open.admin.shopee.io/api/v2/order/get_order_detail?access_token=access_token&order_sn_list=201214JAJXU6G7%2C201214JASXYXY6&partner_id=partner_id&request_order_status_pending=true&response_optional_fields=total_amount&shop_id=shop_id&sign=sign&timestamp=timestamp"

payload={}
headers = {

}
response = requests.RPCRequest("GET",url,headers=headers, data=payload, allow_redirects=False)

print(response.text)
- Response Example (JSON) :
{
{
    "error": "",
    "message": "",
    "request_id": "023c50ace933ba38473a5fb2a7dc8821",
    "response": {
        "order_list": [
            {
                "actual_shipping_fee_confirmed": true,
                "buyer_cancel_reason": "",
                "buyer_cpf_id": null,
                "buyer_user_id": 1170319091,
                "buyer_username": "xt4fdsf96j",
                "cancel_by": "",
                "cancel_reason": "",
                "cod": true,
                "create_time": 1712601591,
                "currency": "VND",
                "days_to_ship": 2,
                "dropshipper": null,
                "dropshipper_phone": null,
                "estimated_shipping_fee": 5000,
                "fulfillment_flag": "fulfilled_by_local_seller",
                "goods_to_declare": false,
                "invoice_data": null,
                "item_list": [
                    {
                        "add_on_deal": false,
                        "add_on_deal_id": 0,
                        "image_info": {
                            "image_url": "https://cf.shopee.vn/file/vn-11134207-7qukw-lf6guphtf6oad3_tn"
                        },
                        "is_b2c_owned_item": false,
                        "is_prescription_item": false,
                        "item_id": 23620853561,
                        "item_name": "🦋giảm giá🦋Kem nở ngực SADOER enlarging breast cream Papaya / Coconut essence 60g Chiết xuất đu đủ, cùi dừa, nở ngực, kem nâng ngực nhanh",
                        "item_sku": "",
                        "main_item": false,
                        "model_discounted_price": 48000,
                        "model_id": 221404189791,
                        "model_name": "60g（Papaya）",
                        "model_original_price": 300000,
                        "model_quantity_purchased": 1,
                        "model_sku": "QAZ-SADOER-05",
                        "order_item_id": 23620853561,
                        "product_location_id": [
                            "VN10XX2UZ"
                        ],
                        "promotion_group_id": 0,
                        "promotion_id": 779222207758537,
                        "promotion_type": "flash_sale",
                        "weight": 0.01,
                        "wholesale": false
                    }
                ],
                "message_to_seller": "",
                "note": "",
                "note_update_time": 0,
                "order_sn": "2404098R48U37H",
                "order_status": "COMPLETED",
                "package_list": [
                    {
                        "group_shipment_id": null,
                        "item_list": [
                            {
                                "item_id": 23620853561,
                                "model_id": 221404189791,
                                "model_quantity": 1,
                                "order_item_id": 23620853561,
                                "product_location_id": "VN10XX2UZ",
                                "promotion_group_id": 0
                            }
                        ],
                        "logistics_status": "LOGISTICS_DELIVERY_DONE",
                        "package_number": "OFG166300791210964",
                        "parcel_chargeable_weight_gram": 10,
                        "shipping_carrier": "5-Day Delivery (SPX)",
                        "logistics_channel_id": 18080
                        "allow_self_design_awb": true,
			"sorting_group": "North"
                    }
                ],
                "pay_time": 1712817766,
                "payment_method": "Cash on Delivery",
                "pickup_done_time": 1712726577,
                "recipient_address": {
                    "city": "Huyện Phước Long",
                    "district": "Xã Phong Thạnh Tây B",
                    "full_address": "Ấp******",
                    "name": "P******n",
                    "phone": "******64",
                    "region": "VN",
                    "state": "Bạc Liêu",
                    "town": "",
                    "zipcode": ""
                },
                "region": "VN",
                "reverse_shipping_fee": 0,
                "ship_by_date": 1712671200,
                "shipping_carrier": "Giao Hàng Nhanh",
                "split_up": false,
                "total_amount": 32119,
                "update_time": 1713139948
            }
        ]
    }
}
- Error Example (JSON) :
{
    "error": "error_not_found",
    "message": "Wrong parameters, detail: the order is not found.",
    "request_id": "f72084b67edbe084aec5f4373d9f0f21"
}


*get shipment list (v2.order.get_shipment_list)
- GET /api/v2/order/get_shipment_list :
Use this api to get order list which order_status is READY_TO_SHIP or RETRY_SHIP to start process the whole shipping progress.
- Common Parameters :
URL : https://partner.shopeemobile.com/api/v2/order/get_shipment_list
- Request Example (Python) :
import requests

url = "https://partner.shopeemobile.com/api/v2/order/get_shipment_list?access_token=access_token&cursor=%22%22&page_size=20&partner_id=partner_id&shop_id=shop_id&sign=sign&timestamp=timestamp"

payload={}
headers = {

}
response = requests.request("GET",url,headers=headers, data=payload, allow_redirects=False)

print(response.text)
- Response Example (JSON) :
{
    "error": "",
    "message": "",
    "response": {
        "order_list": [
            {
                "order_sn": "2003160SXK2A3T",
                "package_number": "38027870177402"
            },
            {
                "order_sn": "200313Q1GR98GC",
                "package_number": "37791910064652"
            },
            {
                "order_sn": "201228RDKTYMXV",
                "package_number": "62839258199004"
            },
            {
                "order_sn": "201228RDQN04K7",
                "package_number": "62839386141287"
            },
            {
                "order_sn": "201228RDQN04K8",
                "package_number": "62839386141288"
            }
        ],
        "more": true,
        "next_cursor": "20"
    },
    "request_id": "69ee3f61ec6f4e3f85836391e5b78dbc"
}
- Error Example (JSON) :
{
    "error": "error_param",
    "message": "Wrong parameters, detail: page_size must be 100 or less.",
    "request_id": "a9bc8e93052a8fcce0099789a19a94e9"
}


*search package list (v2.order.search_package_list)
- POST /api/v2/order/search_package_list :
Use this API to search the list of packages that have not been SHIPPED to proceed arranging shipment, and it supports various filters and sort fields.
- Common Parameters :
URL : https://partner.shopeemobile.com/api/v2/order/search_package_list
- Request Example (Python) :
import requests
import json

url = "https://partner.shopeemobile.com/api/v2/order/search_package_list?access_token=access_token&partner_id=partner_id&shop_id=shop_id&sign=sign&timestamp=timestamp"

payload=json.dumps({
  "filter": {
    "fulfillment_type": 2,
    "invoice_pending": False,
    "is_pre_order": 0,
    "logistics_channel_ids": [
      50021
    ],
    "order_type": 0,
    "package_status": 2,
    "product_location_ids": [
      "VN0005EIZ"
    ],
    "shipping_priority": 0,
    "sorting_group": 1
  },
  "pagination": {
    "cursor": "\"\"",
    "page_size": 5
  },
  "sort": {
    "ascending": False,
    "sort_type": 1
  }
})
headers = {
  'Content-Type': 'application/json'
}
response = requests.RPCRequest("POST",url,headers=headers, data=payload, allow_redirects=False)

print(response.text)
- Response Example (JSON) :
{
	"error": "",
	"message": "",
	"response": {
		"packages_list": [
			{
				"order_sn": "250211UJM7EVM7",
				"package_number": "OFG192947720204989",
				"logistics_channel_id": 50021,
				"product_location_id": "VN0005EIZ",
				"sorting_group": "North",
				"is_shipment_arranged": false
			}
		],
		"pagination": {
			"total_count": 320,
			"next_cursor": "1730437200,184066343203459",
			"more": true
		},
		"sort": {
			"sort_type": 1,
			"is_asc": false
		}
	},
	"request_id": "69ee3f61ec6f4e3f85836391e5b78dbc "
}
- Error Example (JSON) :
No Error Example Set.


*get package detail (v2.order.get_package_detail)
- GET /api/v2/order/get_package_detail :
Use this api to get package detail.
- Common Parameters :
URL : https://partner.shopeemobile.com/api/v2/order/get_package_detail
- Request Example (Python) :
import requests

url = "https://partner.shopeemobile.com/api/v2/order/get_package_detail?access_token=access_token&package_number_list=OFG1156498731071468%2COFG199593509207187&partner_id=partner_id&shop_id=shop_id&sign=sign&timestamp=timestamp"

payload={}
headers = {

}
response = requests.RPCRequest("GET",url,headers=headers, data=payload, allow_redirects=False)

print(response.text)
- Response Example (JSON) :
{
	"error": "-",
	"message": "-",
	"request_id": "69ee3f61ec6f4e3f85836391e5b78dbc",
	"response": {
		"package_list": [
			{
				"order_sn": "220831EGF1JMXF",
				"package_number": "OFG1156498731071468",
				"fulfillment_status": "LOGISTICS_READY",
				"update_time": 1661950674,
				"logistics_channel_id": 80008,
				"shipping_carrier": "JNE Trucking (JTR) LPS",
				"allow_self_design_awb": true,
				"days_to_ship": 3,
				"ship_by_date": 1662209873,
				"pending_terms": [
					"SYSTEM_PENDING"
				],
				"pending_description": [
					"Order is being processed by Shopee"
				],
				"tracking_number": "-",
				"tracking_number_expiration_date": 0,
				"pickup_done_time": 0,
				"is_split_up": false,
				"item_list": [
					{
						"item_id": 2200149592,
						"model_id": 0,
						"item_sku": "-",
						"model_sku": "-",
						"model_quantity": 1,
						"order_item_id": 2200149592,
						"promotion_group_id": 0,
						"product_location_id": "-",
						"consultation_id": "-"
					}
				],
				"recipient_address": {
					"name": "b***r",
					"phone": "******78",
					"town": "****",
					"district": "****",
					"city": "****",
					"state": "****",
					"region": "****",
					"zipcode": "****",
					"full_address": "******11",
					"geolocation": {
						"latitude": -23.567851,
						"longitude": -46.6912611
					}
				},
				"parcel_chargeable_weight_gram": 0,
				"group_shipment_id": 0,
				"virtual_contact_number": "-",
				"package_query_number": "false",
				"sorting_group": "North",
				"is_shipment_arranged": false,
				"status_info_tag": {
					"tag_id": 0,
					"timestamp": 0
				},
				"can_split_order": false,
				"can_unsplit_order": false,
				"is_pre_order": false,
				"prescription_images": [
					"-"
				],
				"pharmacist_name": "-",
				"prescription_approval_time": 1767679728656,
				"prescription_rejection_time": 1767679728656,
				"is_buyer_shop_collection": true,
				"buyer_proof_of_collection": [
					"-"
				],
				"preparation_end_time": 1772276400,
				"driver_info": {
					"driver_name": "",
					"driver_phone": "",
					"vehicle_type": "",
					"license_plate": "",
					"courier_photo": "",
					"eta_start_time": 0,
					"eta_end_time": 0,
					"driver_status": "Driver is on the way"
				}
			}
		]
	},
	"warning": "-"
}
- Error Example (JSON) :
No Error Example Set.


*split order (v2.order.split_order)
- POST /api/v2/order/split_order :
Use this api to split an order into multiple packages. Orders that include installation services cannot be split by quantity.
- Common Parameters :
URL : https://partner.shopeemobile.com/api/v2/order/split_order
- Request Example (Python) :
import requests
import json

url = "https://partner.shopeemobile.com/api/v2/order/split_order?access_token=access_token&partner_id=partner_id&shop_id=shop_id&sign=sign&timestamp=timestamp"

payload=json.dumps({
  "order_sn": "2012300NQJVTYN",
  "package_list": [
    {
      "item_list": [
        {
          "item_id": 3600140554,
          "model_id": 10000605797,
          "order_item_id": 0,
          "promotion_group_id": 0
        }
      ]
    }
  ]
})
headers = {
  'Content-Type': 'application/json'
}
response = requests.request("POST",url,headers=headers, data=payload, allow_redirects=False)

print(response.text)
- Response Example (JSON) :
{
    "error": "",
    "message": "",
    "request_id": "e54894ee0160e1e4a52b108b5a845f41:000000c23066d66c:0000000000000000",
    "response": {
        "order_sn": "230914AV5TVWC2",
        "package_list": [
            {
                "item_list": [
                    {
                        "item_id": 101089151,
                        "model_id": 10004405040,
                        "model_quantity": 2,
                        "order_item_id": 1,
                        "promotion_group_id": 0
                    }
                ],
                "package_number": "OFG148375269133791"
            },
            {
                "item_list": [
                    {
                        "item_id": 843019657,
                        "model_id": 0,
                        "model_quantity": 1,
                        "order_item_id": 2,
                        "promotion_group_id": 0
                    }
                ],
                "package_number": "OFG148375269133792"
            },
            {
                "item_list": [
                    {
                        "item_id": 843019657,
                        "model_id": 0,
                        "model_quantity": 1,
                        "order_item_id": 2,
                        "promotion_group_id": 0
                    }
                ],
                "package_number": "OFG148375269133793"
            }
        ]
    }
}
- Error Example (JSON) :
{
    "request_id":"9798c9d7e89d61beac9063734558ae0d",
    "error":"error_param",
    "msg":"Split order failed, please try again."
}


*unsplit order (v2.order.unsplit_order)
- POST /api/v2/order/unsplit_order :
Use this api to undo split of order. After undo split, the order will have only one package. It can only be used when order status still at READY_TO_SHIP.
- Common Parameters :
URL :     
https://partner.shopeemobile.com/api/v2/order/unsplit_order
- Request Example (Python) :
import requests
import json

url = "https://partner.shopeemobile.com/api/v2/order/unsplit_order?access_token=access_token&partner_id=partner_id&shop_id=shop_id&sign=sign&timestamp=timestamp"

payload=json.dumps({
  "order_sn": "2012312AVA7HVN"
})
headers = {
  'Content-Type': 'application/json'
}
response = requests.request("POST",url,headers=headers, data=payload, allow_redirects=False)

print(response.text)
- Response Example (JSON) :
{
    "error": "",
    "message": "",
    "request_id": "a081e75eb44346caa3d11c8bba5143de"
}
- Error Example (JSON) :
{
    "error":"order.order_cannot_undo_split",
    "message":"Cannot undo split this order.",
    "request_id":"b40356ed43f21598e1f58859498f9fd4"
}


*handle buyer cancellation (v2.order.handle_buyer_cancellation)
- POST /api/v2/order/handle_buyer_cancellation :
Use this api to handle buyer's cancellation application.
- Common Parameters :
URL : https://partner.shopeemobile.com/api/v2/order/handle_buyer_cancellation
- Request Example (Python) :
import requests
import json

url = "https://partner.shopeemobile.com/api/v2/order/handle_buyer_cancellation?access_token=access_token&partner_id=partner_id&shop_id=shop_id&sign=sign&timestamp=timestamp"

payload=json.dumps({
  "operation": "ACCEPT",
  "order_sn": "201016F6B94MQK"
})
headers = {
  'Content-Type': 'application/json'
}
response = requests.request("POST",url,headers=headers, data=payload, allow_redirects=False)

print(response.text)
- Response Example (JSON) :
{
    "request_id": "b937c04e554847789cbf3fe33a0ad5f1",
    "error": "",
    "message": "",
    "response": {
         "update_time": 14981918191
    }
}
- Error Example (JSON) :
{
    "error":"error_param",
    "message":"Wrong parameters, detail: order_sn is a required field.",
    "request_id":"103bab70c9709ceff5154335dfc7b7e1"
}


*get booking list (v2.order.get_booking_list)
- GET /api/v2/order/get_booking_list :
Use this api to search bookings. You may also filter them by status, if needed.
- Common Parameters :
URL : https://partner.shopeemobile.com/api/v2/order/get_booking_list
- Request Example (Python) :
import requests

url = "https://open.admin.uat.shopee.io/api/v2/order/get_booking_list?access_token=access_token&booking_status=READY_TO_SHIP&cursor=%22%22&partner_id=partner_id&shop_id=shop_id&sign=sign&time_range_field=create_time&timestamp=timestamp"

payload={}
headers = {

}
response = requests.RPCRequest("GET",url,headers=headers, data=payload, allow_redirects=False)

print(response.text)
- Response Example (JSON) :
{
	"request_id": "b937c04e554847789cbf3fe33a0ad5f1",
	"error": "common.error_auth",
	"message": "Invalid access_token.",
	"response": {
		"more": false,
		"booking_list": [
			{
				"booking_sn": "201218V2Y6E59M",
				"order_sn": "201218V2Y6E59M",
				"booking_status": "READY_TO_SHIP",
				"next_cursor": "20"
			}
		]
	}
}
- Error Example (JSON) :
{
    "error": "logistics.error_param",
    "message": "Wrong parameters, detail: must use create_time or update_time.",
    "request_id": "049b7512413d403daec97d4320904c8e"
}


*get booking detail (v2.order.get_booking_detail)
- GET /api/v2/order/get_booking_detail :
Use this api to get booking detail.
- Common Parameters :
URL : https://partner.shopeemobile.com/api/v2/order/get_booking_detail
- Request Example (Python) :
import requests

url = "https://open.admin.uat.shopee.io/api/v2/order/get_booking_detail?access_token=access_token&booking_sn_list=201214JAJXU6G7%2C201214JASXYXY6&partner_id=partner_id&response_optional_fields=total_amount&shop_id=shop_id&sign=sign&timestamp=timestamp"

payload={}
headers = {

}
response = requests.RPCRequest("GET",url,headers=headers, data=payload, allow_redirects=False)

print(response.text)
- Response Example (JSON) :
{
	"request_id": "a8e1b94f51d64540bf5762abe7783073",
	"error": "common.error_auth",
	"message": "Invalid access_token.",
	"response": {
		"booking_list": [
			{
				"booking_sn": "201214JASXYXY6",
				"order_sn": "201218V2Y6E59M",
				"region": "MY",
				"booking_status": "CANCELLED",
				"match_status": "MATCH_PENDING",
				"shipping_carrier": "Standard Delivery",
				"create_time": 1607930885,
				"update_time": 1608134691,
				"recipient_address": {
					"name": "Max",
					"phone": "3828203",
					"town": "Sara",
					"district": "Dada",
					"city": "Asajaya",
					"state": "Sarawak",
					"region": "MY",
					"zipcode": "40009",
					"full_address": "C-15-14 BLOK C JALAN 30/146, Asajaya, 40009, Sarawak"
				},
				"item_list": [
					{
						"item_name": "backpack",
						"item_sku": "sku",
						"model_name": "-",
						"model_sku": "-",
						"weight": 12,
						"product_location_id": "-",
						"image_info": {
							"image_url": "-"
						}
					}
				],
				"dropshipper": "-",
				"dropshipper_phone": "-",
				"cancel_by": "system",
				"cancel_reason": "BACKEND_LOGISTICS_NOT_STARTED",
				"fulfillment_flag": "fulfilled_by_shopee",
				"pickup_done_time": 0
			}
		]
	},
	"warning": "string[]"
}
- Error Example (JSON) :
{
    "error": "logistics.error_param",
    "message": "Wrong parameters, detail: booking_sn_list is empty string.",
    "request_id": "50b227d2a8a24157afed45fc01b479f5"
}