TopologyTreeSourceCreator = function(options) {
	if (typeof options != "object") {
		throw new TypeError("Must provide renderTree and displayError callbacks in options");
	}
	if (typeof options.renderTree != "function") {
		throw new TypeError("renderTree argument must be a function");
	}
	if (typeof options.displayError != "function") {
		throw new TypeError("displayError argument must be a function");
	}

	var renderTree = options.renderTree;
	var displayError = options.displayError;

	var availableElementsForTree = {};
	var initialRootNodes = [];
	var canEdit = uptimeGadget.isOwner();

	function buildTreeWithServerResults(userSettings, elementNodes) {
		if (userSettings == null) {
			userSettings = {
				rootNodes : [],
				showFullTree : false
			};
		}
		availableElementsForTree = {};
		$.each(elementNodes, function(i, elementNode) {
			availableElementsForTree[elementNode.id] = elementNode;
		});
		initialRootNodes = getInitialRootNodes(userSettings.rootNodes);
		var showFullTreeCheckbox = $('input[name="showEntireTree"]');
		showFullTreeCheckbox.prop('checked', userSettings.showFullTree);
		showFullTreeCheckbox.prop('disabled', !canEdit);
		populateTopLevelParentSelect();
		buildTreeWithDefaultRootsInMemory();
	}

	function getElementStatuses(elements) {
		var promises = [];
		$.each(elements, function(i, element) {
			if (element.isMonitored && (element.topologicalParents.length > 0 || element.topologicalChildren.length > 0)) {
				var deferred = UPTIME.pub.gadgets.promises.defer();
				var elementNode = {};
				elementNode.id = element.id;
				elementNode.name = element.name;
				elementNode.typeSubtypeName = element.typeSubtypeName;
				$.ajax("/api/v1/elements/" + element.id + "/status", {
					cache : false
				}).done(function(data, textStatus, jqXHR) {
					elementNode.status = data.status;
					elementNode.parents = element.topologicalParents;
					elementNode.monitorStatus = getAdditionalStatus(data.monitorStatus);
					elementNode.message = data.message;
					deferred.resolve(elementNode);
				}).fail(
						function(jqXHR, textStatus, errorThrown) {
							deferred.reject("Unable to build Topology Tree. Failed to retrieve element status for "
									+ elementNode.name + ".");
						});
				promises.push(deferred.promise);
			}
		});
		return UPTIME.pub.gadgets.promises.all(promises);
	}

	function getElements(settings) {
		var deferred = UPTIME.pub.gadgets.promises.defer();
		$.ajax("/api/v1/elements", {
			cache : false
		}).done(function(data, textStatus, jqXHR) {
			deferred.resolve(data);
		}).fail(function(jqXHR, textStatus, errorThrown) {
			deferred.reject("Error loading elements from up.time Controller.");
		});
		return deferred.promise;
	}

	this.getSource = function() {
		uptimeGadget.loadSettings().then(function(settings) {
			getElements().then(getElementStatuses).then(function(elementNodes) {
				buildTreeWithServerResults(settings, elementNodes);
			}, displayError);
		}, function() {
			displayError("Error loading Topology Tree settings.");
		});
	};

	this.rebuildTreeWithCachedResults = function() {
		updateRootNodes();
	};

	function createNodeOnTree(currentNode) {
		var newNode = {};
		newNode.elementId = currentNode.id;
		newNode.elementName = currentNode.name;
		newNode.elementStatus = currentNode.status;
		newNode.statusMessage = currentNode.message;
		newNode.monitorStatus = currentNode.monitorStatus;
		newNode.elementType = currentNode.typeSubtypeName;
		newNode.children = [];
		return newNode;
	}

	function getInitialRootNodes(userRoots) {
		if (userRoots.length != 0) {
			return userRoots;
		}
		var defaultRoot = [];
		$.each(availableElementsForTree, function(i, element) {
			if (element.parents.length == 0) {
				defaultRoot.push(element.id);
			}
		});
		return defaultRoot;
	}

	function buildTreeWithDefaultRootsInMemory() {
		buildTreeInMemory(initialRootNodes);
	}

	function getAdditionalStatus(additionalStatus) {
		// At least one Topological Parent, push parents into the element's
		// 'parents' array
		var additionalStatusArray = [];
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
		var root = {};
		root.elementId = 0;
		root.elementName = "up.time";
		root.elementStatus = "OK";
		root.monitorStatus = [];
		root.statusMessage = "This is always the root of any topology tree";
		root.elementType = "Invisible";
		root.children = [];
		return root;
	}

	function buildTreeInMemory(rootNodes) {
		var elementsOnTree = {};
		var root = createRoot();
		var showFullTree = $('input[name="showEntireTree"]').is(':checked');
		$.each(availableElementsForTree, function(i, currentNode) {
			if (isCurrentNodeRootNode(currentNode, rootNodes)) {
				var childNode = getNodeOnTree(elementsOnTree, currentNode);
				elementsOnTree[childNode.elementId] = childNode;
				root.children.push(childNode);
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
		var topLevelParentSelector = $("#selectTopLevelParent").empty().prop('disabled', !canEdit);
		$.each(parents, function(i, parent) {
			topLevelParentSelector.append(
					"<option value=" + parent.id + " " + shouldBeSelected(parent) + ">" + parent.name + "</option>");
		});
		if (topLevelParentSelector.hasClass("chzn-done")) {
			topLevelParentSelector.trigger("liszt:updated");
		} else {
			topLevelParentSelector.chosen().change(updateRootNodes);
		}
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
		elementsOnTree[childNode.elementId] = childNode;

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
				parentOnTree.children.push(childNode);
			}
		});

		return childNode;
	}

	function buildInvisibleParentNode(node, elementsOnTree, root) {
		if (typeof elementsOnTree[node.id] != "undefined") {
			var parentOnTree = elementsOnTree[node.id];
			elementsOnTree[parentOnTree.elementId] = parentOnTree;
			root.children.push(parentOnTree);
			return parentOnTree;
		}
		var newNode = {};
		newNode.elementId = node.id;
		newNode.elementName = node.name;
		newNode.elementStatus = node.status;
		newNode.statusMessage = "You don't have permission to view this element";
		newNode.monitorStatus = [];
		newNode.elementType = "Invisible";
		newNode.children = [];
		elementsOnTree[newNode.elementId] = newNode;
		root.children.push(newNode);
		return newNode;
	}

	function isParentNodeAvailableForTree(parentNode) {
		return parentNode != null;
	}

	function isParentExist(parent) {
		return typeof parent != "undefined";
	}

	function isAlreadyDependent(parent, child) {
		var matchedElements = $.grep(parent.children, function(e) {
			return e.elementId == child.elementId;
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
