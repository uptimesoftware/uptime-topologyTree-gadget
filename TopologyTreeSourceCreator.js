TopologyTreeSourceCreator = function(options) {
	if (typeof options != "object") {
		throw new TypeError("Must provide renderTree and displayError callbacks in options");
	}
	if (typeof options.renderTree != "function") {
		throw new TypeError("renderTree argument must be a function");
	}
	if (typeof options.displayError != "function") {
		throw new TypeError("renderTree argument must be a function");
	}
	
	var renderTree = options.renderTree;
	var displayError = options.displayError;

	var availableElementsForTree = {};
	var initialRootNodes = [];
	var canEdit = uptimeGadget.isOwner();

	function buildTreeWithServerResults(userSettings) {
		if (userSettings == null) {
			userSettings = {
				rootNodes : [],
				showFullTree : false
			};
		}
		initialRootNodes = getInitialRootNodes(userSettings.rootNodes);
		var showFullTreeCheckbox = $('input[name="showEntireTree"]');
		showFullTreeCheckbox.prop('checked', userSettings.showFullTree);
		showFullTreeCheckbox.prop('disabled', !canEdit);
		populateTopLevelParentSelect();
		buildTreeWithDefaultRootsInMemory();
	}

	function loadUserSettings() {
		uptimeGadget.loadSettings().then(buildTreeWithServerResults, displayError);
	}

	function handleElementStatus(elementNode, statusInfo) {
		elementNode.status = statusInfo.status;
		elementNode.parents = statusInfo.parentsStatus;
		elementNode.monitorStatus = statusInfo.monitorStatuses;
		elementNode.message = statusInfo.message;
		elementNode.statusTask.resolve();
	}

	function pushIntoElementArray(elements) {
		numElements = elements.length - 1;
		var allStatusTasks = [];

		$.each(elements, function(index, element) {
			if (element.isMonitored) {
				var statusTask = new $.Deferred();
				allStatusTasks.push(statusTask);
				var elementNode = new Object();
				elementNode.statusTask = statusTask;
				elementNode.id = element.id;
				elementNode.name = element.name;
				elementNode.typeSubtypeName = element.typeSubtypeName;
				setupStatus(elementNode);
				availableElementsForTree[elementNode.id] = elementNode;
			}
		});

		$.when.apply($, allStatusTasks).done(loadUserSettings);
	}

	this.getSource = function() {
		$.ajax("/api/v1/elements", {
			cache : false
		}).done(function(data, textStatus, jqXHR) {
			pushIntoElementArray(data);
		}).fail(function(jqXHR, textStatus, errorThrown) {
			displayError();
		});
	};

	this.rebuildTreeWithCachedResults = function() {
		updateRootNodes();
	};

	function createNodeOnTree(currentNode) {
		var newNode = new Object();
		newNode.entityId = currentNode.id;
		newNode.entityName = currentNode.name;
		newNode.entityStatus = currentNode.status;
		newNode.statusMessage = currentNode.message;
		newNode.monitorStatus = currentNode.monitorStatus;
		newNode.type = currentNode.typeSubtypeName;
		newNode.dependents = new Array();
		return newNode;
	}

	function hasNoParents(node) {
		return node.parents.length == 0;
	}

	function getInitialRootNodes(userRoots) {
		if (userRoots.length != 0) {
			return userRoots;
		}
		var defaultRoot = [];
		$.each(availableElementsForTree, function(i, element) {
			if (hasNoParents(element)) {
				defaultRoot.push(element.id);
			}
		});
		return defaultRoot;
	}

	function buildTreeWithDefaultRootsInMemory() {
		buildTreeInMemory(initialRootNodes);
	}

	function setupStatus(elementNode) {
		$.ajax("/api/v1/elements/" + elementNode.id + "/status", {
			cache : false
		}).done(function(elementStatus, textStatus, jqXHR) {
			var statusInfo = {};
			statusInfo.message = elementStatus.message;
			statusInfo.status = elementStatus.status;
			statusInfo.parentsStatus = getAdditionalStatus(elementStatus.topologyParentStatus);
			statusInfo.monitorStatuses = getAdditionalStatus(elementStatus.monitorStatus);
			handleElementStatus(elementNode, statusInfo);
		}).fail(function(jqXHR, textStatus, errorThrown) {
			displayError();
		});
	}

	function getAdditionalStatus(additionalStatus) {
		// At least one Topological Parent, push parents into the element's
		// 'parents' array
		var additionalStatusArray = new Array();
		if (additionalStatus.length != 0) {
			$.each(additionalStatus, function(j, additionalElementStatus) {
				additionalStatusArray.push({
					id : additionalElementStatus.id,
					name : additionalElementStatus.name,
					status : additionalElementStatus.status,

				});
			});
		}
		return additionalStatusArray;
	}

	function createRoot() {
		var root = new Object();
		root.entityId = 0;
		root.entityName = "up.time";
		root.dependents = new Array();
		root.entityStatus = "OK";
		root.type = "Invisible";
		root.statusMessage = "This is always the root of any topology tree";
		root.monitorStatus = new Array();
		return root;
	}

	function buildTreeInMemory(rootNodes) {
		var elementsOnTree = {};
		var root = createRoot();
		var showFullTree = $('input[name="showEntireTree"]').is(':checked');
		$.each(availableElementsForTree, function(i, currentNode) {
			if (isCurrentNodeRootNode(currentNode, rootNodes)) {
				var childNode = getNodeOnTree(elementsOnTree, currentNode);
				elementsOnTree[childNode.entityId] = childNode;
				root.dependents.push(childNode);
			}
			if (currentNode.status != "OK" || showFullTree) {
				createBranch(availableElementsForTree, elementsOnTree, currentNode, root);
			}
		});
		renderTree(decompressTree(root));
	}

	function isCurrentNodeRootNode(currentNode, rootNodes) {
		return $.inArray(currentNode.id, rootNodes) > -1;
	}

	function populateTopLevelParentSelect() {
		var parents = getNodesWithChildren();
		$.each(parents, function(i, parent) {

			$("#selectTopLevelParent").append(
					"<option value=" + parent.id + " " + shouldBeSelected(parent) + ">" + parent.name + "</option>");
		});
		var chosen = $("#selectTopLevelParent").chosen();
		$("#selectTopLevelParent").prop('disabled', !canEdit).trigger("liszt:updated");
		chosen.change(updateRootNodes);
	}

	function shouldBeSelected(parent) {
		if (isCurrentNodeRootNode(parent, initialRootNodes)) {
			return "selected='selected'";
		}
		return "";
	}

	function updateRootNodes(event) {
		var rootNodes = getUserSelectedRootNodes();
		var rootNodesAsInt = [];
		$.each(rootNodes, function(i, rootNode) {
			rootNodesAsInt.push(parseInt(rootNode));
		});
		buildTreeInMemory(rootNodesAsInt);
		var showFullTree = $('input[name="showEntireTree"]').is(':checked');
		var settings = {
			rootNodes : rootNodesAsInt,
			showFullTree : showFullTree
		};
		uptimeGadget.saveSettings(settings).then(function() {
		}, function() {
		});
	}

	function getUserSelectedRootNodes() {
		var rootNodes = $("#selectTopLevelParent").val();
		if (rootNodes == null) {
			return [];
		}
		return rootNodes;
	}

	function getNodesWithChildren() {
		var eligibleParents = {};
		$.each(availableElementsForTree, function(i, currentNode) {
			$.each(currentNode.parents, function(j, parent) {
				eligibleParents[parent.name] = parent;
			});
		});
		return eligibleParents;
	}

	function decompressTree(source) {
		return jQuery.extend(true, {}, source);
	}

	function createBranch(availableElementsForTree, elementsOnTree, node, root) {
		var childNode = getNodeOnTree(elementsOnTree, node);
		elementsOnTree[childNode.entityId] = childNode;

		$.each(node.parents, function(i, parent) {
			var parentOnTree = elementsOnTree[parent.id];
			if (typeof parentOnTree == "undefined") {
				var parentNode = availableElementsForTree[parent.id];
				if (isParentNodeAvailableForTree(parentNode)) {
					parentOnTree = createBranch(availableElementsForTree, elementsOnTree, parentNode, root);
				} else {
					parentOnTree = buildInvisibleParentNode(parent, elementsOnTree, root);

				}

			}

			if (isParentExist(parentOnTree) && !isAlreadyDependent(parentOnTree, childNode)) {
				parentOnTree.dependents.push(childNode);
			}
		});

		return childNode;
	}

	function buildInvisibleParentNode(node, elementsOnTree, root) {
		if (typeof elementsOnTree[node.id] != "undefined") {
			var parentOnTree = elementsOnTree[node.id];
			elementsOnTree[parentOnTree.entityId] = parentOnTree;
			root.dependents.push(parentOnTree);
			return parentOnTree;
		}
		var newNode = new Object();
		newNode.entityId = node.id;
		newNode.entityName = node.name;
		newNode.entityStatus = node.status;
		newNode.statusMessage = "You don't have permission to view this element";
		newNode.monitorStatus = new Array();
		newNode.type = "Invisible";
		newNode.dependents = new Array();
		elementsOnTree[newNode.entityId] = newNode;
		root.dependents.push(newNode);
		return newNode;
	}

	function isParentNodeAvailableForTree(parentNode) {
		return parentNode != null;
	}

	function isParentExist(parent) {
		return typeof parent != "undefined";
	}

	function isAlreadyDependent(parent, child) {
		var matchedElements = $.grep(parent.dependents, function(e) {
			return e.entityId == child.entityId;
		});
		return matchedElements != 0;
	}

	function getNodeOnTree(elementsOnTree, currentNode) {
		if (typeof elementsOnTree[currentNode.id] != "undefined") {
			return elementsOnTree[currentNode.id];
		}
		return createNodeOnTree(currentNode);
	}

};
