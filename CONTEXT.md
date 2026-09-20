# Tips Beauty

Online cosmetics store for the Sudanese market. A customer Storefront and a separate Admin Portal share one Supabase backend.

## Language

### Apps

**Storefront**:
The customer-facing shopping app: a mobile-first web app that is also shipped to app stores inside a native wrapper.
_Avoid_: main site, frontend, website

**Admin Portal**:
The staff-only app for managing products, orders, promotions and drivers. Hosted separately from the Storefront.
_Avoid_: dashboard, backoffice

### Catalogue

**Product**:
A cosmetics item offered for sale. May have Variants and an origin (imported or local).

**Variant** (Arabic: الخيار):
A purchasable option of a Product (e.g. shade, size) with its own price. The chosen Variant is recorded on the Order; Stock is counted per Product, not per Variant.
_Avoid_: option, SKU

**Review**:
A customer's rating and comment on a Product. Only a customer with a delivered Order containing that Product may write one, and only one per Product.
_Avoid_: comment, feedback, rating (a rating is part of a Review)

**Collection** (post-launch; Arabic: التشكيلة):
A staff-defined, named grouping of Products shown as a row on the Storefront home page, independent of a Product's Category — it cuts across Categories rather than replacing them. Its members are either hand-picked by staff or produced by a rule (newest, best sellers, on Discount, under a price, in a Category). Only sellable Products appear.
_Avoid_: category, folder, group

### Ordering

**Order**:
A customer's confirmed request to buy a set of Products, delivered to an address in a Sudanese State. Its total is computed by the backend, never trusted from the Storefront.
_Avoid_: purchase, transaction, cart (a Cart is not yet an Order)

**Cart**:
The customer's not-yet-ordered selection of Products, kept on their device.
_Avoid_: basket

**Order Status**:
The lifecycle stage of an Order: new → confirmed → preparing → shipped → delivered, or cancelled.

**Payment Method**:
How the customer pays: Cash on Delivery or Mycashi. Both are settled manually — staff mark the Order paid in the Admin Portal; there is no payment gateway integration.
_Avoid_: Fawry (not available in Sudan)

**Cash on Delivery (COD)**:
The customer pays the Driver in cash when the Order is delivered. Nothing is required at checkout.

**Mycashi**:
A Sudanese mobile-money transfer. The customer must enter the transfer Reference Number and upload a Payment Proof at checkout; staff verify both before confirming the Order.

**Reference Number** (Arabic: الرقم المرجعي):
The identifier of a Mycashi transfer, entered by the customer at checkout.
_Avoid_: transaction ID, receipt number, رقم العملية

**Payment Proof** (Arabic: إثبات الدفع):
The screenshot of a Mycashi transfer uploaded by the customer at checkout. Visible only to the customer who uploaded it and to staff.
_Avoid_: receipt, screenshot, attachment, الإيصال

**Payment Status**:
Whether staff have recorded the Order as paid.

**Discount** (Arabic: الخصم):
A percentage reduction on a single Product's price, set by staff. The only pricing rule at launch.
_Avoid_: offer, sale

**Promotion** (post-launch; Arabic: العرض):
A scheduled percentage or fixed-amount reduction that applies automatically to all Products, a Category, a Brand, or chosen Products. Requires nothing from the customer.
_Avoid_: campaign, deal, sale

**Coupon** (post-launch; Arabic: كود الخصم):
A code the customer types at checkout to receive a reduction on the Order. Staff manage its validity window, minimum Order amount, total and per-customer usage limits.
_Avoid_: voucher, promo code

**Pricing Rule**:
Any of Discount, Promotion or Coupon. Only one applies to a given amount: the largest single reduction wins; they never stack.

**Banner** (post-launch):
A staff-managed image with title, link and schedule shown on the Storefront home page. Has no effect on prices.
_Avoid_: marketing campaign, promotion, ad

### Stock

**Warehouse** (Arabic: المخزن):
A physical location Tips Beauty ships Orders from (Khartoum and Port Sudan at launch). Each Warehouse holds its own Stock of each Product; an Order is fulfilled from one Warehouse.
_Avoid_: store, depot, branch

**Stock**:
The quantity of a Product available to sell in a Warehouse, maintained by staff. Counted per Product, never per Variant. Reserved atomically by the backend when an Order is created and restored when the Order is cancelled.
_Avoid_: inventory, quantity on hand

**Return** (post-launch; Arabic: المرتجع):
A customer's request, within the Return Window, to send back some items of a delivered Order for a refund or an exchange. Staff review it; a refund is settled manually (cash or Mycashi) and recorded by staff, and returned items may be restocked.
_Avoid_: refund (a refund is one outcome of a Return), cancellation (a cancellation happens before delivery)

**Return Window**:
The 7 days after an Order is delivered during which a Return may be requested.

**Order Expiry**:
The automatic cancellation of an Order that stays `new` for 48 hours, releasing its Stock.
_Avoid_: timeout, abandoned order

### Notifications

**Order Confirmation**:
The Arabic email sent to the customer when their Order is created.

**New-Order Alert**:
The Arabic email sent to staff when an Order is created, linking to the Order in the Admin Portal.

**Unseen Order** (Arabic: لم يُطّلع عليه):
A `new` Order no staff member has opened yet in the Admin Portal.
_Avoid_: unread, غير مقروء, pending (pending is a Payment concept)

**Customer Notification** (post-launch; Arabic: الإشعار):
An Arabic in-app message shown to a customer inside the Storefront (Order Status change, a Review invitation, a restock). Separate from email; marked read by the customer.
_Avoid_: alert (an Alert goes to staff), push

### Delivery

**Driver**:
A Tips Beauty employee who delivers Orders. Delivery is always by own Drivers, never a third-party courier.
_Avoid_: courier, delivery partner

**State**:
One of the Sudanese states an Order can be delivered to. All states are served.
_Avoid_: region, province, city (a city is within a State)

**Locality** (Arabic: المحلية):
A delivery area within a State (e.g. Omdurman within Khartoum State), maintained by staff with its own Shipping Fee.
_Avoid_: city, district, zone, area, منطقة, مناطق, المدينة

**Shipping Fee**:
The delivery charge for an Order, determined by the Locality, or by the State's default fee when no Locality is chosen.
_Avoid_: delivery cost, flat rate

### Money

**SDG**:
Sudanese pound, the only currency used. Displayed as ج.س.
